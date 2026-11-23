import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.ts';
import { pool } from '../../../src/db/index.ts';
import { createPost, likePost, registerUser } from '../../helpers/api.ts';
import { resetDatabase } from '../../helpers/database.ts';

const app = createApp();

function getPost(id: number | string, token?: string) {
  const req = request(app).get(`/api/posts/${id}`);
  if (token !== undefined) req.set('Authorization', `Bearer ${token}`);
  return req;
}

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
        likesCount: 0,
        likedByMe: false,
      });
    });

    it('does not expose author email or password', async () => {
      const { token, user } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await request(app).get(`/api/posts/${post.id}`);

      expect(JSON.stringify(response.body)).not.toContain(user.email);
      expect(response.body.author).toEqual({ id: user.id, name: user.name });
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

  describe('likes', () => {
    it('returns likesCount with the number of likes of the post', async () => {
      const author = await registerUser(app);
      const fan = await registerUser(app, { email: 'fan@example.com' });
      const post = await createPost(app, author.token);
      const other = await createPost(app, author.token);
      await likePost(app, author.token, post.id);
      await likePost(app, fan.token, post.id);
      await likePost(app, fan.token, other.id);

      const response = await getPost(post.id);

      expect(response.body.likesCount).toBe(2);
    });

    it('returns likedByMe false without token, even if the post has likes', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      await likePost(app, token, post.id);

      const response = await getPost(post.id);

      expect(response.status).toBe(200);
      expect(response.body.likedByMe).toBe(false);
    });

    it('returns likedByMe true when the authenticated user liked the post', async () => {
      const author = await registerUser(app);
      const fan = await registerUser(app, { email: 'fan@example.com' });
      const post = await createPost(app, author.token);
      await likePost(app, fan.token, post.id);

      const response = await getPost(post.id, fan.token);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ likesCount: 1, likedByMe: true });
    });

    it('returns likedByMe false when only other users liked the post', async () => {
      const author = await registerUser(app);
      const fan = await registerUser(app, { email: 'fan@example.com' });
      const post = await createPost(app, author.token);
      await likePost(app, fan.token, post.id);

      const response = await getPost(post.id, author.token);

      expect(response.body).toMatchObject({ likesCount: 1, likedByMe: false });
    });

    it('returns likedByMe false when the user liked only another post', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      const other = await createPost(app, token);
      await likePost(app, token, other.id);

      const response = await getPost(post.id, token);

      expect(response.body.likedByMe).toBe(false);
    });

    it('returns likedByMe false after the user unlikes the post', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      await likePost(app, token, post.id);
      await request(app).delete(`/api/posts/${post.id}/likes`).set('Authorization', `Bearer ${token}`);

      const response = await getPost(post.id, token);

      expect(response.body).toMatchObject({ likesCount: 0, likedByMe: false });
    });
  });

  describe('optional authentication', () => {
    it('returns 401 with a malformed Authorization header', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await request(app)
        .get(`/api/posts/${post.id}`)
        .set('Authorization', 'Bearer invalid');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 with a well-formed but unknown token', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await getPost(post.id, 'a'.repeat(64));

      expect(response.status).toBe(401);
    });

    it('returns 401 with a token replaced by a newer login', async () => {
      const { token: oldToken, user } = await registerUser(app);
      const post = await createPost(app, oldToken);
      await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'secret123' });

      const response = await getPost(post.id, oldToken);

      expect(response.status).toBe(401);
    });

    it('validates the token before checking whether the post exists', async () => {
      const response = await getPost(999, 'a'.repeat(64));

      expect(response.status).toBe(401);
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
