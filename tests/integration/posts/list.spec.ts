import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.ts';
import { db, pool } from '../../../src/db/index.ts';
import { posts } from '../../../src/db/schema.ts';
import { likePost, registerUser } from '../../helpers/api.ts';
import { resetDatabase } from '../../helpers/database.ts';

const app = createApp();
const route = '/api/posts';

// Insere direto no banco com createdAt controlado: post `i` é criado `i` minutos após a base.
async function seedPosts(authorId: number, count: number, base = Date.UTC(2026, 0, 1)) {
  const values = Array.from({ length: count }, (_, i) => ({
    title: `Post ${i + 1}`,
    content: `Content ${i + 1}`,
    authorId,
    createdAt: new Date(base + i * 60_000),
  }));
  return db.insert(posts).values(values).returning();
}

describe('GET /api/posts', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('success', () => {
    it('returns 200 with empty data and coherent meta when there are no posts', async () => {
      const response = await request(app).get(route);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: [],
        meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
      });
    });

    it('is public (no token required) and returns posts in the contract format', async () => {
      const { user } = await registerUser(app);
      const [post] = await seedPosts(user.id, 1);

      const response = await request(app).get(route);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([
        {
          id: post.id,
          title: post.title,
          content: post.content,
          createdAt: post.createdAt.toISOString(),
          author: { id: user.id, name: user.name },
          likesCount: 0,
        },
      ]);
    });

    it('returns likesCount for each post', async () => {
      const { token, user } = await registerUser(app);
      const fan = await registerUser(app, { email: 'fan@example.com' });
      const [first, second, third] = await seedPosts(user.id, 3);
      await likePost(app, token, first.id);
      await likePost(app, fan.token, first.id);
      await likePost(app, fan.token, second.id);

      const response = await request(app).get(route);

      const likesById = Object.fromEntries(
        response.body.data.map((p: { id: number; likesCount: number }) => [p.id, p.likesCount]),
      );
      expect(likesById).toEqual({ [first.id]: 2, [second.id]: 1, [third.id]: 0 });
    });

    it('does not include likedByMe, even with a valid token', async () => {
      const { token, user } = await registerUser(app);
      const [post] = await seedPosts(user.id, 1);
      await likePost(app, token, post.id);

      const response = await request(app).get(route).set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data[0]).not.toHaveProperty('likedByMe');
    });

    it('ignores an invalid Authorization header (public route)', async () => {
      const response = await request(app).get(route).set('Authorization', 'Bearer invalid');

      expect(response.status).toBe(200);
    });

    it('does not expose author email or password', async () => {
      const { user } = await registerUser(app);
      await seedPosts(user.id, 1);

      const response = await request(app).get(route);

      expect(JSON.stringify(response.body)).not.toContain(user.email);
      expect(response.body.data[0].author).toEqual({ id: user.id, name: user.name });
    });

    it('orders posts by createdAt desc', async () => {
      const { user } = await registerUser(app);
      await seedPosts(user.id, 3);

      const response = await request(app).get(route);

      expect(response.body.data.map((p: { title: string }) => p.title)).toEqual([
        'Post 3',
        'Post 2',
        'Post 1',
      ]);
    });

    it('includes posts from different authors, each with its own author name', async () => {
      const alice = await registerUser(app, { name: 'Alice', email: 'alice@example.com' });
      const bob = await registerUser(app, { name: 'Bob', email: 'bob@example.com' });
      await seedPosts(alice.user.id, 1, Date.UTC(2026, 0, 1));
      await seedPosts(bob.user.id, 1, Date.UTC(2026, 0, 2));

      const response = await request(app).get(route);

      expect(response.body.data.map((p: { author: unknown }) => p.author)).toEqual([
        { id: bob.user.id, name: 'Bob' },
        { id: alice.user.id, name: 'Alice' },
      ]);
    });
  });

  describe('pagination', () => {
    it('defaults to page 1 with 10 items per page', async () => {
      const { user } = await registerUser(app);
      await seedPosts(user.id, 25);

      const response = await request(app).get(route);

      expect(response.body.data).toHaveLength(10);
      expect(response.body.data[0].title).toBe('Post 25');
      expect(response.body.data[9].title).toBe('Post 16');
      expect(response.body.meta).toEqual({ page: 1, limit: 10, total: 25, totalPages: 3 });
    });

    it('returns the requested page', async () => {
      const { user } = await registerUser(app);
      await seedPosts(user.id, 25);

      const response = await request(app).get(route).query({ page: 2 });

      expect(response.status).toBe(200);
      expect(response.body.data.map((p: { title: string }) => p.title)).toEqual(
        Array.from({ length: 10 }, (_, i) => `Post ${15 - i}`),
      );
      expect(response.body.meta).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
    });

    it('returns the remaining items on the last page', async () => {
      const { user } = await registerUser(app);
      await seedPosts(user.id, 25);

      const response = await request(app).get(route).query({ page: 3 });

      expect(response.body.data.map((p: { title: string }) => p.title)).toEqual([
        'Post 5',
        'Post 4',
        'Post 3',
        'Post 2',
        'Post 1',
      ]);
    });

    it('handles a total that is an exact multiple of the limit', async () => {
      const { user } = await registerUser(app);
      await seedPosts(user.id, 10);

      const page1 = await request(app).get(route).query({ page: 1 });
      const page2 = await request(app).get(route).query({ page: 2 });

      expect(page1.body.data).toHaveLength(10);
      expect(page1.body.meta).toEqual({ page: 1, limit: 10, total: 10, totalPages: 1 });
      expect(page2.status).toBe(200);
      expect(page2.body).toEqual({
        data: [],
        meta: { page: 2, limit: 10, total: 10, totalPages: 1 },
      });
    });

    it('handles the largest accepted page without database errors', async () => {
      const { user } = await registerUser(app);
      await seedPosts(user.id, 1);

      const response = await request(app).get(route).query({ page: 2147483647 });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
      expect(response.body.meta.page).toBe(2147483647);
    });

    it.each(['foo=bar', 'page[]=2', 'page[a]=2'])(
      'falls back to page 1 when page is not sent as a plain value (?%s)',
      async (query) => {
        const response = await request(app).get(`${route}?${query}`);

        expect(response.status).toBe(200);
        expect(response.body.meta.page).toBe(1);
      },
    );

    it('returns 200 with empty data (not 404) for a page beyond the last', async () => {
      const { user } = await registerUser(app);
      await seedPosts(user.id, 25);

      const response = await request(app).get(route).query({ page: 4 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: [],
        meta: { page: 4, limit: 10, total: 25, totalPages: 3 },
      });
    });

    it('keeps a stable order for posts with the same createdAt (no duplicates across pages)', async () => {
      const { user } = await registerUser(app);
      const sameTime = new Date(Date.UTC(2026, 0, 1));
      await db.insert(posts).values(
        Array.from({ length: 15 }, (_, i) => ({
          title: `Post ${i + 1}`,
          content: 'x',
          authorId: user.id,
          createdAt: sameTime,
        })),
      );

      const page1 = await request(app).get(route).query({ page: 1 });
      const page2 = await request(app).get(route).query({ page: 2 });

      const ids = [...page1.body.data, ...page2.body.data].map((p: { id: number }) => p.id);
      expect(new Set(ids).size).toBe(15);
    });
  });

  describe('validation', () => {
    const invalidPages = ['0', '-1', 'abc', '1.5', '1.0', '01', '0x2', '1e1', '', '2147483648'];

    it.each(invalidPages)('returns 400 when page is "%s"', async (page) => {
      const response = await request(app).get(`${route}?page=${encodeURIComponent(page)}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'page' })]),
      );
    });

    it('returns 400 when page is sent more than once', async () => {
      const response = await request(app).get(`${route}?page=1&page=2`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
