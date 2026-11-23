import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.ts';
import { db, pool } from '../../../src/db/index.ts';
import { posts } from '../../../src/db/schema.ts';
import { resetDatabase } from '../../helpers/database.ts';

const app = createApp();
const route = '/api/posts';

const author = { name: 'John Doe', email: 'john@example.com', password: 'secret123' };
const validPost = { title: 'My first post', content: 'Hello, world!' };

async function registerUser(user = author) {
  const response = await request(app).post('/api/auth/register').send(user);
  return response.body as { token: string; user: { id: number; name: string } };
}

function createPost(token: string | null, body: unknown) {
  const req = request(app).post(route);
  if (token !== null) req.set('Authorization', `Bearer ${token}`);
  return req.send(body as object);
}

describe('POST /api/posts', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('success', () => {
    it('returns 201 with the created post and its author', async () => {
      const { token, user } = await registerUser();

      const response = await createPost(token, validPost);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: expect.any(Number),
        title: validPost.title,
        content: validPost.content,
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        author: { id: user.id, name: author.name },
        likesCount: 0,
      });
    });

    it('persists the post linked to the authenticated user', async () => {
      const { token, user } = await registerUser();

      const response = await createPost(token, validPost);

      const [stored] = await db.select().from(posts).where(eq(posts.id, response.body.id));
      expect(stored).toMatchObject({ ...validPost, authorId: user.id });
      expect(stored.createdAt.toISOString()).toBe(response.body.createdAt);
    });

    it('ignores authorId sent in the body (author always comes from the token)', async () => {
      const other = await registerUser({ ...author, email: 'other@example.com' });
      const { token, user } = await registerUser();

      const response = await createPost(token, { ...validPost, authorId: other.user.id });

      expect(response.status).toBe(201);
      expect(response.body.author.id).toBe(user.id);
    });

    it('trims title and content', async () => {
      const { token } = await registerUser();

      const response = await createPost(token, { title: '  Title  ', content: '\n Body \n' });

      expect(response.status).toBe(201);
      expect(response.body.title).toBe('Title');
      expect(response.body.content).toBe('Body');
    });

    it('does not expose author email or password', async () => {
      const { token } = await registerUser();

      const response = await createPost(token, validPost);

      expect(JSON.stringify(response.body)).not.toContain(author.email);
      expect(response.body.author).not.toHaveProperty('password');
    });
  });

  describe('authentication', () => {
    const cases: Array<[string, string | undefined]> = [
      ['header is missing', undefined],
      ['scheme is not Bearer', `Basic ${'a'.repeat(64)}`],
      ['token is empty', 'Bearer '],
      ['token is malformed', 'Bearer not-a-token'],
      ['token does not exist', `Bearer ${'a'.repeat(64)}`],
    ];

    it.each(cases)('returns 401 when %s', async (_label, header) => {
      await registerUser();
      const req = request(app).post(route);
      if (header !== undefined) req.set('Authorization', header);

      const response = await req.send(validPost);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(await db.select().from(posts)).toHaveLength(0);
    });

    it('returns 401 with a token replaced by a newer login', async () => {
      const { token: oldToken } = await registerUser();
      await request(app).post('/api/auth/login').send({ email: author.email, password: author.password });

      const response = await createPost(oldToken, validPost);

      expect(response.status).toBe(401);
    });

    it('accepts the Bearer scheme case-insensitively (RFC 7235)', async () => {
      const { token } = await registerUser();

      const response = await request(app)
        .post(route)
        .set('Authorization', `bearer ${token}`)
        .send(validPost);

      expect(response.status).toBe(201);
    });

    it('accepts the token in uppercase hex', async () => {
      const { token } = await registerUser();

      const response = await createPost(token.toUpperCase(), validPost);

      expect(response.status).toBe(201);
    });

    it('returns 401 when there is more than one space after Bearer', async () => {
      const { token } = await registerUser();

      const response = await request(app)
        .post(route)
        .set('Authorization', `Bearer  ${token}`)
        .send(validPost);

      expect(response.status).toBe(401);
    });

    it('checks auth before validating the body', async () => {
      const response = await createPost(null, {});

      expect(response.status).toBe(401);
    });
  });

  describe('validation', () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['title is missing', { content: validPost.content }, 'title'],
      ['title is empty', { ...validPost, title: '' }, 'title'],
      ['title is only whitespace', { ...validPost, title: '   ' }, 'title'],
      ['title exceeds 200 chars', { ...validPost, title: 'a'.repeat(201) }, 'title'],
      ['title is not a string', { ...validPost, title: 123 }, 'title'],
      ['content is missing', { title: validPost.title }, 'content'],
      ['content is empty', { ...validPost, content: '' }, 'content'],
      ['content is only whitespace', { ...validPost, content: '  \n ' }, 'content'],
      ['content is not a string', { ...validPost, content: ['x'] }, 'content'],
    ];

    it.each(cases)('returns 400 when %s', async (_label, body, field) => {
      const { token } = await registerUser();

      const response = await createPost(token, body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: field })]),
      );
      expect(await db.select().from(posts)).toHaveLength(0);
    });

    it('counts title length in characters, not UTF-16 units (200 emojis ok, 201 rejected)', async () => {
      const { token } = await registerUser();

      const ok = await createPost(token, { ...validPost, title: '😀'.repeat(200) });
      const tooLong = await createPost(token, { ...validPost, title: '😀'.repeat(201) });

      expect(ok.status).toBe(201);
      expect(ok.body.title).toBe('😀'.repeat(200));
      expect(tooLong.status).toBe(400);
    });

    it('returns 400 when body is not JSON (text/plain)', async () => {
      const { token } = await registerUser();

      const response = await request(app)
        .post(route)
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'text/plain')
        .send('title=x');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when body is an array', async () => {
      const { token } = await registerUser();

      const response = await createPost(token, [validPost]);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('accepts a title with exactly 200 chars', async () => {
      const { token } = await registerUser();

      const response = await createPost(token, { ...validPost, title: 'a'.repeat(200) });

      expect(response.status).toBe(201);
    });

    it('returns 400 when body is malformed JSON', async () => {
      const { token } = await registerUser();

      const response = await request(app)
        .post(route)
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json')
        .send('{"title": "x",');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
