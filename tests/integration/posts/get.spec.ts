import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.ts';
import { pool } from '../../../src/db/index.ts';
import { createPost, registerUser } from '../../helpers/api.ts';
import { resetDatabase } from '../../helpers/database.ts';

const app = createApp();

describe('GET /api/posts/:id', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('success', () => {
    it('returns 200 with the post and its author, without token', async () => {
      const { token, user } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await request(app).get(`/api/posts/${post.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: post.id,
        title: post.title,
        content: post.content,
        createdAt: post.createdAt,
        author: { id: user.id, name: user.name },
      });
    });

    it('does not expose author email or password', async () => {
      const { token, user } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await request(app).get(`/api/posts/${post.id}`);

      expect(JSON.stringify(response.body)).not.toContain(user.email);
      expect(response.body.author).toEqual({ id: user.id, name: user.name });
    });

    it('ignores an invalid Authorization header (public route)', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await request(app)
        .get(`/api/posts/${post.id}`)
        .set('Authorization', 'Bearer invalid');

      expect(response.status).toBe(200);
    });

    it('reflects updates made to the post', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      await request(app)
        .put(`/api/posts/${post.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Updated' });

      const response = await request(app).get(`/api/posts/${post.id}`);

      expect(response.body.title).toBe('Updated');
    });
  });

  describe('not found', () => {
    it('returns 404 when the post does not exist', async () => {
      const response = await request(app).get('/api/posts/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Post not found' } });
    });

    it('returns 404 after the post is deleted', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      await request(app).delete(`/api/posts/${post.id}`).set('Authorization', `Bearer ${token}`);

      const response = await request(app).get(`/api/posts/${post.id}`);

      expect(response.status).toBe(404);
    });
  });

  describe('validation', () => {
    const invalidIds = ['abc', '0', '-1', '1.5', '1.0', '01', '0x10', '1e1', '%201%20', '2147483648'];

    it.each(invalidIds)('returns 400 when id is "%s"', async (id) => {
      const response = await request(app).get(`/api/posts/${id}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'id' })]),
      );
    });
  });
});
