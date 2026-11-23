import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.ts';
import { db, pool } from '../../../src/db/index.ts';
import { replies } from '../../../src/db/schema.ts';
import { createPost, createReply, registerUser } from '../../helpers/api.ts';
import { resetDatabase } from '../../helpers/database.ts';

const app = createApp();

function deleteReply(token: string | null, postId: number | string, replyId: number | string) {
  const req = request(app).delete(`/api/posts/${postId}/replies/${replyId}`);
  if (token !== null) req.set('Authorization', `Bearer ${token}`);
  return req.send();
}

async function replyExists(id: number) {
  const rows = await db.select({ id: replies.id }).from(replies).where(eq(replies.id, id));
  return rows.length > 0;
}

describe('DELETE /api/posts/:id/replies/:replyId', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('success', () => {
    it('returns 204 with empty body and removes the reply (hard delete)', async () => {
      const author = await registerUser(app);
      const replier = await registerUser(app, { email: 'jane@example.com' });
      const post = await createPost(app, author.token);
      const reply = await createReply(app, replier.token, post.id);

      const response = await deleteReply(replier.token, post.id, reply.id);

      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect(await replyExists(reply.id)).toBe(false);
    });

    it('removes only the target reply', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      const target = await createReply(app, token, post.id);
      const other = await createReply(app, token, post.id);

      await deleteReply(token, post.id, target.id);

      expect(await replyExists(other.id)).toBe(true);
    });

    it('lets the post author delete their own reply on their own post', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      const reply = await createReply(app, token, post.id);

      const response = await deleteReply(token, post.id, reply.id);

      expect(response.status).toBe(204);
    });

    it('keeps the post when the reply is deleted', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      const reply = await createReply(app, token, post.id);

      await deleteReply(token, post.id, reply.id);

      const response = await request(app).get(`/api/posts/${post.id}`);
      expect(response.status).toBe(200);
    });

    it('ignores a body sent with the request', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      const reply = await createReply(app, token, post.id);

      const response = await request(app)
        .delete(`/api/posts/${post.id}/replies/${reply.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ authorId: 999 });

      expect(response.status).toBe(204);
      expect(await replyExists(reply.id)).toBe(false);
    });

    it('returns 404 when deleting the same reply twice', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      const reply = await createReply(app, token, post.id);

      await deleteReply(token, post.id, reply.id);
      const response = await deleteReply(token, post.id, reply.id);

      expect(response.status).toBe(404);
    });
  });

  describe('authorization', () => {
    it('returns 403 when the reply belongs to another user and keeps it', async () => {
      const replier = await registerUser(app);
      const intruder = await registerUser(app, { email: 'intruder@example.com' });
      const post = await createPost(app, replier.token);
      const reply = await createReply(app, replier.token, post.id);

      const response = await deleteReply(intruder.token, post.id, reply.id);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: { code: 'FORBIDDEN', message: 'You can only delete your own replies' },
      });
      expect(await replyExists(reply.id)).toBe(true);
    });

    it('returns 403 even for the post author when the reply is from someone else', async () => {
      const postAuthor = await registerUser(app);
      const replier = await registerUser(app, { email: 'jane@example.com' });
      const post = await createPost(app, postAuthor.token);
      const reply = await createReply(app, replier.token, post.id);

      const response = await deleteReply(postAuthor.token, post.id, reply.id);

      expect(response.status).toBe(403);
      expect(await replyExists(reply.id)).toBe(true);
    });

    it('still lets the reply author delete after another user was denied', async () => {
      const replier = await registerUser(app);
      const intruder = await registerUser(app, { email: 'intruder@example.com' });
      const post = await createPost(app, replier.token);
      const reply = await createReply(app, replier.token, post.id);
      await deleteReply(intruder.token, post.id, reply.id);

      const response = await deleteReply(replier.token, post.id, reply.id);

      expect(response.status).toBe(204);
    });

    it('returns 401 without token and keeps the reply', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      const reply = await createReply(app, token, post.id);

      const response = await deleteReply(null, post.id, reply.id);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(await replyExists(reply.id)).toBe(true);
    });

    it('returns 401 with an invalid token', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      const reply = await createReply(app, token, post.id);

      const response = await deleteReply('a'.repeat(64), post.id, reply.id);

      expect(response.status).toBe(401);
      expect(await replyExists(reply.id)).toBe(true);
    });

    it('returns 401 with a token replaced by a newer login', async () => {
      const { token: oldToken, user } = await registerUser(app);
      const post = await createPost(app, oldToken);
      const reply = await createReply(app, oldToken, post.id);
      await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'secret123' });

      const response = await deleteReply(oldToken, post.id, reply.id);

      expect(response.status).toBe(401);
      expect(await replyExists(reply.id)).toBe(true);
    });
  });

  describe('not found', () => {
    it('returns 404 when the reply does not exist', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await deleteReply(token, post.id, 999);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Reply not found' } });
    });

    it('returns 404 when the post does not exist', async () => {
      const { token } = await registerUser(app);

      const response = await deleteReply(token, 999, 1);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when the reply belongs to another post and keeps it', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      const otherPost = await createPost(app, token);
      const reply = await createReply(app, token, post.id);

      const response = await deleteReply(token, otherPost.id, reply.id);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Reply not found' } });
      expect(await replyExists(reply.id)).toBe(true);
    });

    it('returns 404 (not 403) for a reply of another user on another post', async () => {
      const replier = await registerUser(app);
      const intruder = await registerUser(app, { email: 'intruder@example.com' });
      const post = await createPost(app, replier.token);
      const intruderPost = await createPost(app, intruder.token);
      const reply = await createReply(app, replier.token, post.id);

      const response = await deleteReply(intruder.token, intruderPost.id, reply.id);

      expect(response.status).toBe(404);
      expect(await replyExists(reply.id)).toBe(true);
    });

    it('returns 404 when the post was deleted (replies go with it)', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      const reply = await createReply(app, token, post.id);
      await request(app).delete(`/api/posts/${post.id}`).set('Authorization', `Bearer ${token}`);

      const response = await deleteReply(token, post.id, reply.id);

      expect(response.status).toBe(404);
      expect(await replyExists(reply.id)).toBe(false);
    });
  });

  describe('validation', () => {
    const invalidIds = ['abc', '0', '-1', '1.5', '1.0', '01', '0x10', '1e1', '0b11', '%201%20', '2147483648'];

    it.each(invalidIds)('returns 400 when id is "%s"', async (id) => {
      const { token } = await registerUser(app);

      const response = await deleteReply(token, id, 1);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'id' })]),
      );
    });

    it.each(invalidIds)('returns 400 when replyId is "%s"', async (replyId) => {
      const { token } = await registerUser(app);

      const response = await deleteReply(token, 1, replyId);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'replyId' })]),
      );
    });
  });
});
