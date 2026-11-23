import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.ts';
import { db, pool } from '../../../src/db/index.ts';
import { postLikes } from '../../../src/db/schema.ts';
import { createPost, likePost, registerUser } from '../../helpers/api.ts';
import { resetDatabase } from '../../helpers/database.ts';

const app = createApp();

function unlikePost(token: string | null, id: number | string) {
  const req = request(app).delete(`/api/posts/${id}/likes`);
  if (token !== null) req.set('Authorization', `Bearer ${token}`);
  return req.send();
}

async function countStoredLikes(postId: number, userId?: number) {
  return db.$count(
    postLikes,
    userId === undefined
      ? eq(postLikes.postId, postId)
      : and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)),
  );
}

describe('DELETE /api/posts/:id/likes', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('success', () => {
    it('returns 200 with the updated likes count and removes the like', async () => {
      const { token, user } = await registerUser(app);
      const post = await createPost(app, token);
      await likePost(app, token, post.id);

      const response = await unlikePost(token, post.id);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ likes: 0 });
      expect(await countStoredLikes(post.id, user.id)).toBe(0);
    });

    it('removes only the like of the authenticated user', async () => {
      const author = await registerUser(app);
      const fan = await registerUser(app, { email: 'fan@example.com' });
      const post = await createPost(app, author.token);
      await likePost(app, author.token, post.id);
      await likePost(app, fan.token, post.id);

      const response = await unlikePost(fan.token, post.id);

      expect(response.body).toEqual({ likes: 1 });
      expect(await countStoredLikes(post.id, author.user.id)).toBe(1);
      expect(await countStoredLikes(post.id, fan.user.id)).toBe(0);
    });

    it('removes only the like on the target post', async () => {
      const { token, user } = await registerUser(app);
      const target = await createPost(app, token);
      const other = await createPost(app, token);
      await likePost(app, token, target.id);
      await likePost(app, token, other.id);

      await unlikePost(token, target.id);

      expect(await countStoredLikes(other.id, user.id)).toBe(1);
    });

    it('is idempotent: unliking a post that was not liked returns 200', async () => {
      const author = await registerUser(app);
      const fan = await registerUser(app, { email: 'fan@example.com' });
      const post = await createPost(app, author.token);
      await likePost(app, author.token, post.id);

      const response = await unlikePost(fan.token, post.id);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ likes: 1 });
    });

    it('is idempotent: unliking twice returns 200 both times', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      await likePost(app, token, post.id);
      await unlikePost(token, post.id);

      const response = await unlikePost(token, post.id);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ likes: 0 });
    });

    it('allows liking again after unliking', async () => {
      const { token, user } = await registerUser(app);
      const post = await createPost(app, token);
      await likePost(app, token, post.id);
      await unlikePost(token, post.id);

      const liked = await likePost(app, token, post.id);

      expect(liked).toEqual({ likes: 1 });
      expect(await countStoredLikes(post.id, user.id)).toBe(1);
    });

    it('ignores a body sent with the request', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      await likePost(app, token, post.id);

      const response = await request(app)
        .delete(`/api/posts/${post.id}/likes`)
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: 999 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ likes: 0 });
    });
  });

  describe('authorization', () => {
    it('returns 401 without token and keeps the like', async () => {
      const { token, user } = await registerUser(app);
      const post = await createPost(app, token);
      await likePost(app, token, post.id);

      const response = await unlikePost(null, post.id);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(await countStoredLikes(post.id, user.id)).toBe(1);
    });

    it('returns 401 with an invalid token', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      await likePost(app, token, post.id);

      const response = await unlikePost('a'.repeat(64), post.id);

      expect(response.status).toBe(401);
      expect(await countStoredLikes(post.id)).toBe(1);
    });

    it('returns 401 with a token replaced by a newer login', async () => {
      const { token: oldToken, user } = await registerUser(app);
      const post = await createPost(app, oldToken);
      await likePost(app, oldToken, post.id);
      await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'secret123' });

      const response = await unlikePost(oldToken, post.id);

      expect(response.status).toBe(401);
      expect(await countStoredLikes(post.id, user.id)).toBe(1);
    });
  });

  describe('not found', () => {
    it('returns 404 when the post does not exist', async () => {
      const { token } = await registerUser(app);

      const response = await unlikePost(token, 999);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Post not found' } });
    });

    it('returns 404 when the post was deleted', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      await likePost(app, token, post.id);
      await request(app).delete(`/api/posts/${post.id}`).set('Authorization', `Bearer ${token}`);

      const response = await unlikePost(token, post.id);

      expect(response.status).toBe(404);
    });
  });

  describe('validation', () => {
    const invalidIds = ['abc', '0', '-1', '1.5', '1.0', '01', '0x10', '1e1', '0b11', '%201%20', '2147483648'];

    it.each(invalidIds)('returns 400 when id is "%s"', async (id) => {
      const { token } = await registerUser(app);

      const response = await unlikePost(token, id);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'id' })]),
      );
    });
  });
});
