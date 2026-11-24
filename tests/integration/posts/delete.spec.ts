import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.ts';
import { db, pool } from '../../../src/db/index.ts';
import { posts } from '../../../src/db/schema.ts';
import { createPost, registerUser } from '../../helpers/api.ts';
import { resetDatabase } from '../../helpers/database.ts';
import { listUploads, makeImage, resetUploads } from '../../helpers/uploads.ts';

const app = createApp();

async function uploadPostImage(token: string, postId: number) {
  return request(app)
    .put(`/api/posts/${postId}/image`)
    .set('Authorization', `Bearer ${token}`)
    .attach('image', await makeImage(), 'photo.png');
}

function deletePost(token: string | null, id: number | string) {
  const req = request(app).delete(`/api/posts/${id}`);
  if (token !== null) req.set('Authorization', `Bearer ${token}`);
  return req.send();
}

async function postExists(id: number) {
  const rows = await db.select({ id: posts.id }).from(posts).where(eq(posts.id, id));
  return rows.length > 0;
}

describe('DELETE /api/posts/:id', () => {
  beforeEach(async () => {
    await resetDatabase();
    await resetUploads();
  });

  afterAll(async () => {
    await resetUploads();
    await pool.end();
  });

  describe('success', () => {
    it('returns 204 with empty body and removes the post (hard delete)', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await deletePost(token, post.id);

      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect(await postExists(post.id)).toBe(false);
    });

    it('removes only the target post', async () => {
      const { token } = await registerUser(app);
      const target = await createPost(app, token);
      const other = await createPost(app, token);

      await deletePost(token, target.id);

      expect(await postExists(other.id)).toBe(true);
    });

    it('ignores a body sent with the request', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await request(app)
        .delete(`/api/posts/${post.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ foo: 'bar' });

      expect(response.status).toBe(204);
      expect(await postExists(post.id)).toBe(false);
    });

    it('removes the post image file from disk', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      await uploadPostImage(token, post.id);
      expect(await listUploads('posts')).toHaveLength(1);

      const response = await deletePost(token, post.id);

      expect(response.status).toBe(204);
      expect(await listUploads('posts')).toEqual([]);
    });

    it('keeps the image files of other posts', async () => {
      const { token } = await registerUser(app);
      const target = await createPost(app, token);
      const other = await createPost(app, token);
      await uploadPostImage(token, target.id);
      const { body } = await uploadPostImage(token, other.id);

      await deletePost(token, target.id);

      expect(await listUploads('posts')).toEqual([body.imageUrl.split('/').pop()]);
    });

    it('keeps the image file when the delete is denied (403)', async () => {
      const owner = await registerUser(app);
      const intruder = await registerUser(app, { email: 'intruder@example.com' });
      const post = await createPost(app, owner.token);
      await uploadPostImage(owner.token, post.id);

      await deletePost(intruder.token, post.id);

      expect(await listUploads('posts')).toHaveLength(1);
    });

    it('returns 404 when deleting the same post twice', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      await deletePost(token, post.id);
      const response = await deletePost(token, post.id);

      expect(response.status).toBe(404);
    });
  });

  describe('authorization', () => {
    it('returns 401 without token and keeps the post', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await deletePost(null, post.id);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(await postExists(post.id)).toBe(true);
    });

    it('returns 401 with an invalid token', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await deletePost('a'.repeat(64), post.id);

      expect(response.status).toBe(401);
    });

    it('returns 401 with a token replaced by a newer login', async () => {
      const { token: oldToken, user } = await registerUser(app);
      const post = await createPost(app, oldToken);
      await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'secret123' });

      const response = await deletePost(oldToken, post.id);

      expect(response.status).toBe(401);
      expect(await postExists(post.id)).toBe(true);
    });

    it('still lets the owner delete after another user was denied', async () => {
      const owner = await registerUser(app);
      const intruder = await registerUser(app, { email: 'intruder@example.com' });
      const post = await createPost(app, owner.token);
      await deletePost(intruder.token, post.id);

      const response = await deletePost(owner.token, post.id);

      expect(response.status).toBe(204);
    });

    it('returns 403 when the post belongs to another user and keeps it', async () => {
      const owner = await registerUser(app);
      const intruder = await registerUser(app, { email: 'intruder@example.com' });
      const post = await createPost(app, owner.token);

      const response = await deletePost(intruder.token, post.id);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: { code: 'FORBIDDEN', message: 'You can only delete your own posts' },
      });
      expect(await postExists(post.id)).toBe(true);
    });
  });

  describe('not found', () => {
    it('returns 404 when the post does not exist', async () => {
      const { token } = await registerUser(app);

      const response = await deletePost(token, 999);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Post not found' } });
    });
  });

  describe('validation', () => {
    const invalidIds = ['abc', '0', '-1', '1.5', '1.0', '01', '0x10', '1e1', '0b11', '%201%20', '2147483648'];

    it.each(invalidIds)('returns 400 when id is "%s"', async (id) => {
      const { token } = await registerUser(app);

      const response = await deletePost(token, id);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'id' })]),
      );
    });
  });
});
