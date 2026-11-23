import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.ts';
import { db, pool } from '../../../src/db/index.ts';
import { posts } from '../../../src/db/schema.ts';
import { createPost, likePost, registerUser } from '../../helpers/api.ts';
import { resetDatabase } from '../../helpers/database.ts';

const app = createApp();

function updatePost(token: string | null, id: number | string, body: unknown) {
  const req = request(app).put(`/api/posts/${id}`);
  if (token !== null) req.set('Authorization', `Bearer ${token}`);
  return req.send(body as object);
}

async function findStoredPost(id: number) {
  const [post] = await db.select().from(posts).where(eq(posts.id, id));
  return post;
}

describe('PUT /api/posts/:id', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('success', () => {
    it('updates title and content and returns 200 with the post', async () => {
      const { token, user } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await updatePost(token, post.id, { title: 'New title', content: 'New content' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: post.id,
        title: 'New title',
        content: 'New content',
        createdAt: post.createdAt,
        author: { id: user.id, name: user.name },
        likesCount: 0,
      });
    });

    it('returns the current likesCount of the post', async () => {
      const { token } = await registerUser(app);
      const fan = await registerUser(app, { email: 'fan@example.com' });
      const post = await createPost(app, token);
      await likePost(app, token, post.id);
      await likePost(app, fan.token, post.id);

      const response = await updatePost(token, post.id, { title: 'New title' });

      expect(response.status).toBe(200);
      expect(response.body.likesCount).toBe(2);
    });

    it('updates only the title (partial update)', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await updatePost(token, post.id, { title: 'Only title' });

      expect(response.status).toBe(200);
      expect(response.body.title).toBe('Only title');
      expect(response.body.content).toBe(post.content);
      expect(await findStoredPost(post.id)).toMatchObject({ title: 'Only title', content: post.content });
    });

    it('updates only the content (partial update)', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await updatePost(token, post.id, { content: 'Only content' });

      expect(response.status).toBe(200);
      expect(response.body.title).toBe(post.title);
      expect(await findStoredPost(post.id)).toMatchObject({ title: post.title, content: 'Only content' });
    });

    it('trims the fields', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await updatePost(token, post.id, { title: '  Trimmed  ' });

      expect(response.body.title).toBe('Trimmed');
    });

    it('keeps createdAt and authorId unchanged', async () => {
      const { token, user } = await registerUser(app);
      const post = await createPost(app, token);

      await updatePost(token, post.id, { title: 'New title' });

      const stored = await findStoredPost(post.id);
      expect(stored.createdAt.toISOString()).toBe(post.createdAt);
      expect(stored.authorId).toBe(user.id);
    });
  });

  describe('authorization', () => {
    it('returns 401 without token', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await updatePost(null, post.id, { title: 'Hacked' });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 with an invalid token', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await updatePost('a'.repeat(64), post.id, { title: 'Hacked' });

      expect(response.status).toBe(401);
    });

    it('returns 401 with a token replaced by a newer login', async () => {
      const { token: oldToken, user } = await registerUser(app);
      const post = await createPost(app, oldToken);
      await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'secret123' });

      const response = await updatePost(oldToken, post.id, { title: 'New title' });

      expect(response.status).toBe(401);
      expect((await findStoredPost(post.id)).title).toBe(post.title);
    });

    it('still lets the owner update after another user was denied', async () => {
      const owner = await registerUser(app);
      const intruder = await registerUser(app, { email: 'intruder@example.com' });
      const post = await createPost(app, owner.token);
      await updatePost(intruder.token, post.id, { title: 'Hacked' });

      const response = await updatePost(owner.token, post.id, { title: 'By owner' });

      expect(response.status).toBe(200);
      expect(response.body.title).toBe('By owner');
    });

    it('returns 403 when the post belongs to another user and keeps it unchanged', async () => {
      const owner = await registerUser(app);
      const intruder = await registerUser(app, { email: 'intruder@example.com' });
      const post = await createPost(app, owner.token);

      const response = await updatePost(intruder.token, post.id, { title: 'Hacked' });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: { code: 'FORBIDDEN', message: 'You can only update your own posts' },
      });
      expect((await findStoredPost(post.id)).title).toBe(post.title);
    });
  });

  describe('not found', () => {
    it('returns 404 when the post does not exist', async () => {
      const { token } = await registerUser(app);

      const response = await updatePost(token, 999, { title: 'New title' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Post not found' } });
    });
  });

  describe('validation', () => {
    const invalidIds = ['abc', '0', '-1', '1.5', '1.0', '01', '0x10', '1e1', '0b11', '%201%20', '2147483648'];

    it.each(invalidIds)('returns 400 when id is "%s"', async (id) => {
      const { token } = await registerUser(app);

      const response = await updatePost(token, id, { title: 'New title' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'id' })]),
      );
    });

    const invalidBodies: Array<[string, unknown]> = [
      ['body is empty', {}],
      ['title is empty', { title: '' }],
      ['title is only whitespace', { title: '   ' }],
      ['title exceeds 200 chars', { title: 'a'.repeat(201) }],
      ['title is null', { title: null }],
      ['content is empty', { content: '' }],
      ['content is not a string', { content: 123 }],
      ['body has extra fields', { title: 'ok', authorId: 2 }],
      ['body has only extra fields', { createdAt: '2020-01-01T00:00:00.000Z' }],
    ];

    it.each(invalidBodies)('returns 400 when %s and keeps the post unchanged', async (_label, body) => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await updatePost(token, post.id, body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(await findStoredPost(post.id)).toMatchObject({ title: post.title, content: post.content });
    });

    it('does not persist a valid field when another field is invalid', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await updatePost(token, post.id, { title: 'Valid title', content: '' });

      expect(response.status).toBe(400);
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'content' })]),
      );
      expect((await findStoredPost(post.id)).title).toBe(post.title);
    });

    it('accepts a title with exactly 200 chars', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await updatePost(token, post.id, { title: 'a'.repeat(200) });

      expect(response.status).toBe(200);
    });

    it('returns 400 when body is malformed JSON', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await request(app)
        .put(`/api/posts/${post.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json')
        .send('{"title":');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when body is not JSON (text/plain)', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await request(app)
        .put(`/api/posts/${post.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'text/plain')
        .send('title=x');

      expect(response.status).toBe(400);
    });

    it('returns 400 when body is an array', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await updatePost(token, post.id, [{ title: 'x' }]);

      expect(response.status).toBe(400);
    });

    it('returns 400 (not 403/404) for an invalid body on another user post', async () => {
      const owner = await registerUser(app);
      const intruder = await registerUser(app, { email: 'intruder@example.com' });
      const post = await createPost(app, owner.token);

      const response = await updatePost(intruder.token, post.id, {});

      expect(response.status).toBe(400);
    });
  });
});
