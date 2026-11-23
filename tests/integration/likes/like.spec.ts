import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.ts';
import { db, pool } from '../../../src/db/index.ts';
import { postLikes } from '../../../src/db/schema.ts';
import { createPost, registerUser } from '../../helpers/api.ts';
import { resetDatabase } from '../../helpers/database.ts';

const app = createApp();

function likePost(token: string | null, id: number | string) {
  const req = request(app).post(`/api/posts/${id}/likes`);
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

describe('POST /api/posts/:id/likes', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('success', () => {
    it('returns 200 with the updated likes count', async () => {
      const author = await registerUser(app);
      const fan = await registerUser(app, { email: 'fan@example.com' });
      const post = await createPost(app, author.token);

      const response = await likePost(fan.token, post.id);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ likes: 1 });
    });

    it('persists the like linked to the authenticated user', async () => {
      const author = await registerUser(app);
      const fan = await registerUser(app, { email: 'fan@example.com' });
      const post = await createPost(app, author.token);

      await likePost(fan.token, post.id);

      expect(await countStoredLikes(post.id, fan.user.id)).toBe(1);
    });

    it('lets the author like their own post', async () => {
      const { token, user } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await likePost(token, post.id);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ likes: 1 });
      expect(await countStoredLikes(post.id, user.id)).toBe(1);
    });

    it('counts likes from different users', async () => {
      const author = await registerUser(app);
      const fan = await registerUser(app, { email: 'fan@example.com' });
      const post = await createPost(app, author.token);
      await likePost(author.token, post.id);

      const response = await likePost(fan.token, post.id);

      expect(response.body).toEqual({ likes: 2 });
    });

    it('counts only the likes of the target post', async () => {
      const { token } = await registerUser(app);
      const fan = await registerUser(app, { email: 'fan@example.com' });
      const other = await createPost(app, token);
      const target = await createPost(app, token);
      await likePost(token, other.id);
      await likePost(fan.token, other.id);

      const response = await likePost(token, target.id);

      expect(response.body).toEqual({ likes: 1 });
    });

    it('is idempotent: liking twice keeps a single like', async () => {
      const { token, user } = await registerUser(app);
      const post = await createPost(app, token);
      await likePost(token, post.id);

      const response = await likePost(token, post.id);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ likes: 1 });
      expect(await countStoredLikes(post.id, user.id)).toBe(1);
    });

    it('keeps a single like under concurrent requests from the same user', async () => {
      const { token, user } = await registerUser(app);
      const post = await createPost(app, token);

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => likePost(token, post.id)),
      );

      expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      expect(await countStoredLikes(post.id, user.id)).toBe(1);
    });

    it('ignores a body sent with the request', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await request(app)
        .post(`/api/posts/${post.id}/likes`)
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: 999, likes: 100 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ likes: 1 });
    });
  });

  describe('authorization', () => {
    it('returns 401 without token and does not store a like', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await likePost(null, post.id);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(await countStoredLikes(post.id)).toBe(0);
    });

    it('returns 401 with an invalid token', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await likePost('a'.repeat(64), post.id);

      expect(response.status).toBe(401);
      expect(await countStoredLikes(post.id)).toBe(0);
    });

    it('returns 401 with a token replaced by a newer login', async () => {
      const { token: oldToken, user } = await registerUser(app);
      const post = await createPost(app, oldToken);
      await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'secret123' });

      const response = await likePost(oldToken, post.id);

      expect(response.status).toBe(401);
      expect(await countStoredLikes(post.id)).toBe(0);
    });
  });

  describe('not found', () => {
    it('returns 404 when the post does not exist', async () => {
      const { token } = await registerUser(app);

      const response = await likePost(token, 999);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Post not found' } });
    });

    it('returns 404 when the post was deleted', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      await request(app).delete(`/api/posts/${post.id}`).set('Authorization', `Bearer ${token}`);

      const response = await likePost(token, post.id);

      expect(response.status).toBe(404);
      expect(await countStoredLikes(post.id)).toBe(0);
    });
  });

  describe('validation', () => {
    const invalidIds = ['abc', '0', '-1', '1.5', '1.0', '01', '0x10', '1e1', '0b11', '%201%20', '2147483648'];

    it.each(invalidIds)('returns 400 when id is "%s"', async (id) => {
      const { token } = await registerUser(app);

      const response = await likePost(token, id);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'id' })]),
      );
    });
  });
});
