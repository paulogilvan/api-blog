import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.ts';
import { db, pool } from '../../../src/db/index.ts';
import { replies } from '../../../src/db/schema.ts';
import { emailsQueue } from '../../../src/queues/emails/queue.ts';
import { startEmailWorker } from '../../../src/queues/emails/worker.ts';
import { createPost, registerUser } from '../../helpers/api.ts';
import { resetDatabase } from '../../helpers/database.ts';
import { getMessage, listMessages, markMailbox, waitForMessage } from '../../helpers/mailpit.ts';
import {
  clearEmailQueue,
  emailQueueJobCount,
  waitForEmailQueueIdle,
} from '../../helpers/queue.ts';

const app = createApp();
// O e-mail sai pela fila: o worker roda aqui, como no processo da API (`server.ts`).
let emailWorker: ReturnType<typeof startEmailWorker>;

const validReply = { content: 'Great post!' };

function createReply(token: string | null, postId: number | string, body: unknown) {
  const req = request(app).post(`/api/posts/${postId}/replies`);
  if (token !== null) req.set('Authorization', `Bearer ${token}`);
  return req.send(body as object);
}

async function storedReplies() {
  return db.select().from(replies);
}

describe('POST /api/posts/:id/replies', () => {
  beforeAll(async () => {
    // Jobs criados por specs anteriores (que não rodam worker) não devem virar e-mails aqui.
    await clearEmailQueue();
    emailWorker = startEmailWorker();
  });

  beforeEach(async () => {
    await resetDatabase();
    // Os e-mails do teste anterior precisam sair antes da marca do Mailpit deste teste.
    await waitForEmailQueueIdle();
    // Fila vazia a cada teste: `emailQueueJobCount()` conta só os jobs deste teste.
    await clearEmailQueue();
    await markMailbox();
  });

  afterAll(async () => {
    await emailWorker.close();
    await pool.end();
  });

  describe('success', () => {
    it('returns 201 with the created reply and its author', async () => {
      const author = await registerUser(app);
      const replier = await registerUser(app, { name: 'Jane Roe', email: 'jane@example.com' });
      const post = await createPost(app, author.token);

      const response = await createReply(replier.token, post.id, validReply);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: expect.any(Number),
        content: validReply.content,
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        author: { id: replier.user.id, name: 'Jane Roe' },
      });
    });

    it('persists the reply linked to the post and to the authenticated user', async () => {
      const author = await registerUser(app);
      const replier = await registerUser(app, { email: 'jane@example.com' });
      const post = await createPost(app, author.token);

      const response = await createReply(replier.token, post.id, validReply);

      const [stored] = await db.select().from(replies).where(eq(replies.id, response.body.id));
      expect(stored).toMatchObject({
        content: validReply.content,
        postId: post.id,
        authorId: replier.user.id,
      });
      expect(stored.createdAt.toISOString()).toBe(response.body.createdAt);
    });

    it('lets the post author reply to their own post', async () => {
      const { token, user } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await createReply(token, post.id, validReply);

      expect(response.status).toBe(201);
      expect(response.body.author.id).toBe(user.id);
    });

    it('allows several replies from the same user on the same post', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const first = await createReply(token, post.id, { content: 'First' });
      const second = await createReply(token, post.id, { content: 'Second' });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.id).not.toBe(first.body.id);
      expect(await storedReplies()).toHaveLength(2);
    });

    it('trims content', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await createReply(token, post.id, { content: '\n  Nice!  \n' });

      expect(response.status).toBe(201);
      expect(response.body.content).toBe('Nice!');
    });

    it('accepts content with exactly 1000 characters (counted after trim)', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await createReply(token, post.id, { content: `  ${'a'.repeat(1000)}  ` });

      expect(response.status).toBe(201);
      expect(response.body.content).toHaveLength(1000);
    });

    it('counts content length in characters, not UTF-16 units (1000 emojis ok, 1001 rejected)', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const ok = await createReply(token, post.id, { content: '😀'.repeat(1000) });
      const tooLong = await createReply(token, post.id, { content: '😀'.repeat(1001) });

      expect(ok.status).toBe(201);
      expect(ok.body.content).toBe('😀'.repeat(1000));
      expect(tooLong.status).toBe(400);
    });

    it('does not expose author email or password', async () => {
      const { token, user } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await createReply(token, post.id, validReply);

      expect(JSON.stringify(response.body)).not.toContain(user.email);
      expect(response.body.author).toEqual({ id: user.id, name: user.name });
    });
  });

  describe('e-mail to the post author', () => {
    it('sends the new reply e-mail to the post author', async () => {
      const author = await registerUser(app);
      const replier = await registerUser(app, { name: 'Jane Roe', email: 'jane@example.com' });
      const post = await createPost(app, author.token, {
        title: 'My first post',
        content: 'Hello',
      });

      const response = await createReply(replier.token, post.id, { content: 'Great post!' });

      expect(response.status).toBe(201);
      const summary = await waitForMessage({ to: author.user.email });
      const message = await getMessage(summary.ID);
      expect(message.Subject).toBe('New reply on "My first post"');
      expect(message.From.Address).toBe('no-reply@blog.local');
      expect(message.To.map((to) => to.Address)).toEqual([author.user.email]);
      for (const body of [message.Text, message.HTML]) {
        expect(body).toContain('Jane Roe');
        expect(body).toContain('My first post');
        expect(body).toContain('Great post!');
      }
    });

    it('does not send an e-mail when the author replies to their own post', async () => {
      const author = await registerUser(app);
      const post = await createPost(app, author.token);

      const response = await createReply(author.token, post.id, validReply);

      expect(response.status).toBe(201);
      // Nenhum job deve ter sido criado; a pausa cobre um envio que, por engano, ocorresse.
      expect(await emailQueueJobCount()).toBe(0);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(await listMessages()).toEqual([]);
    });

    it('responds before the e-mail is sent (delivery happens in the queue)', async () => {
      const author = await registerUser(app);
      const replier = await registerUser(app, { email: 'jane@example.com' });
      const post = await createPost(app, author.token);
      // Fila pausada (nenhum worker consome): a resposta não pode depender do envio.
      await emailsQueue.pause();

      try {
        const response = await createReply(replier.token, post.id, validReply);

        expect(response.status).toBe(201);
        expect(await emailQueueJobCount()).toBe(1);
        expect(await listMessages()).toEqual([]);
      } finally {
        await emailsQueue.resume();
      }

      await waitForMessage({ to: author.user.email });
    });

    it('sends one e-mail per reply', async () => {
      const author = await registerUser(app);
      const replier = await registerUser(app, { email: 'jane@example.com' });
      const post = await createPost(app, author.token);

      await createReply(replier.token, post.id, { content: 'First' });
      await createReply(replier.token, post.id, { content: 'Second' });

      await waitForMessage({ to: author.user.email });
      // O worker envia em paralelo: espera os dois jobs terminarem antes de contar.
      await waitForEmailQueueIdle();
      const messages = await listMessages();
      expect(messages).toHaveLength(2);
      expect(messages.every((m) => m.To[0].Address === author.user.email)).toBe(true);
    });

    it('escapes user-provided text in the html version', async () => {
      const author = await registerUser(app);
      const replier = await registerUser(app, {
        name: '<script>alert(1)</script>',
        email: 'jane@example.com',
      });
      const post = await createPost(app, author.token, {
        title: 'Tom & <b>Jerry</b>',
        content: 'x',
      });

      await createReply(replier.token, post.id, { content: '<img src=x onerror=alert(1)>' });

      const message = await getMessage((await waitForMessage({ to: author.user.email })).ID);
      expect(message.HTML).not.toContain('<script>');
      expect(message.HTML).not.toContain('<img');
      expect(message.HTML).not.toContain('<b>Jerry');
      expect(message.HTML).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(message.HTML).toContain('Tom &amp; &lt;b&gt;Jerry&lt;/b&gt;');
      expect(message.HTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('does not include the replier e-mail address in the message', async () => {
      const author = await registerUser(app);
      const replier = await registerUser(app, { email: 'jane@example.com' });
      const post = await createPost(app, author.token);

      await createReply(replier.token, post.id, validReply);

      const message = await getMessage((await waitForMessage({ to: author.user.email })).ID);
      expect(message.Text).not.toContain('jane@example.com');
      expect(message.HTML).not.toContain('jane@example.com');
    });

    it('does not send an e-mail when the reply is rejected', async () => {
      const author = await registerUser(app);
      const replier = await registerUser(app, { email: 'jane@example.com' });
      const post = await createPost(app, author.token);

      await createReply(replier.token, post.id, { content: '' });
      await createReply(replier.token, 999, validReply);

      expect(await emailQueueJobCount()).toBe(0);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(await listMessages()).toEqual([]);
    });
  });

  describe('authentication', () => {
    const cases: Array<[string, string | undefined]> = [
      ['header is missing', undefined],
      ['scheme is not Bearer', `Basic ${'a'.repeat(64)}`],
      ['token is malformed', 'Bearer not-a-token'],
      ['token does not exist', `Bearer ${'a'.repeat(64)}`],
    ];

    it.each(cases)('returns 401 when %s and stores nothing', async (_label, header) => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      const req = request(app).post(`/api/posts/${post.id}/replies`);
      if (header !== undefined) req.set('Authorization', header);

      const response = await req.send(validReply);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(await storedReplies()).toHaveLength(0);
    });

    it('returns 401 with a token replaced by a newer login', async () => {
      const { token: oldToken, user } = await registerUser(app);
      const post = await createPost(app, oldToken);
      await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'secret123' });

      const response = await createReply(oldToken, post.id, validReply);

      expect(response.status).toBe(401);
      expect(await storedReplies()).toHaveLength(0);
    });

    it('checks auth before validating params and body', async () => {
      const response = await createReply(null, 'abc', {});

      expect(response.status).toBe(401);
    });
  });

  describe('not found', () => {
    it('returns 404 when the post does not exist', async () => {
      const { token } = await registerUser(app);

      const response = await createReply(token, 999, validReply);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Post not found' } });
      expect(await storedReplies()).toHaveLength(0);
    });

    it('returns 404 when the post was deleted', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      await request(app).delete(`/api/posts/${post.id}`).set('Authorization', `Bearer ${token}`);

      const response = await createReply(token, post.id, validReply);

      expect(response.status).toBe(404);
    });
  });

  describe('validation', () => {
    const invalidIds = ['abc', '0', '-1', '1.5', '1.0', '01', '0x10', '1e1', '0b11', '%201%20', '2147483648'];

    it.each(invalidIds)('returns 400 when id is "%s"', async (id) => {
      const { token } = await registerUser(app);

      const response = await createReply(token, id, validReply);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'id' })]),
      );
    });

    const bodyCases: Array<[string, Record<string, unknown>, string]> = [
      ['content is missing', {}, 'content'],
      ['content is empty', { content: '' }, 'content'],
      ['content is only whitespace', { content: '  \n ' }, 'content'],
      ['content exceeds 1000 chars', { content: 'a'.repeat(1001) }, 'content'],
      ['content is not a string', { content: 123 }, 'content'],
      ['content is null', { content: null }, 'content'],
    ];

    it.each(bodyCases)('returns 400 when %s and stores nothing', async (_label, body, field) => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await createReply(token, post.id, body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: field })]),
      );
      expect(await storedReplies()).toHaveLength(0);
    });

    it.each(['postId', 'authorId', 'id'])(
      'returns 400 when the body has the extra field "%s"',
      async (field) => {
        const { token } = await registerUser(app);
        const post = await createPost(app, token);

        const response = await createReply(token, post.id, { ...validReply, [field]: 1 });

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
        expect(await storedReplies()).toHaveLength(0);
      },
    );

    it('returns 400 when the JSON is malformed', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await request(app)
        .post(`/api/posts/${post.id}/replies`)
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json')
        .send('{"content": ');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when there is no body', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await createReply(token, post.id, undefined);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
