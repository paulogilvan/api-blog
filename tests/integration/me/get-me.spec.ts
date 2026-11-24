import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.ts';
import { db, pool } from '../../../src/db/index.ts';
import { users } from '../../../src/db/schema.ts';
import { defaultUser, registerUser } from '../../helpers/api.ts';
import { resetDatabase } from '../../helpers/database.ts';
import { makeImage, resetUploads } from '../../helpers/uploads.ts';

const app = createApp();

function getMe(token: string | null) {
  const req = request(app).get('/api/me');
  if (token !== null) req.set('Authorization', `Bearer ${token}`);
  return req;
}

describe('GET /api/me', () => {
  beforeEach(async () => {
    await resetDatabase();
    await resetUploads();
  });

  afterAll(async () => {
    await resetUploads();
    await pool.end();
  });

  describe('success', () => {
    it('returns 200 with the authenticated user in the Me format', async () => {
      const { token, user } = await registerUser(app);

      const response = await getMe(token);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: null,
        createdAt: expect.any(String),
      });
      expect(new Date(response.body.createdAt).toISOString()).toBe(response.body.createdAt);
    });

    it('returns the current avatarUrl after an avatar upload', async () => {
      const { token } = await registerUser(app);
      const upload = await request(app)
        .put('/api/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('image', await makeImage(), 'avatar.png');

      const response = await getMe(token);

      expect(response.status).toBe(200);
      expect(response.body.avatarUrl).toBe(upload.body.avatarUrl);
      expect(response.body.avatarUrl).toMatch(/^\/uploads\/avatars\/[0-9a-f-]{36}\.webp$/);
    });

    it('returns the user that owns the token, not another one', async () => {
      await registerUser(app, { email: 'first@example.com', name: 'First' });
      const { token, user } = await registerUser(app, {
        email: 'second@example.com',
        name: 'Second',
      });

      const response = await getMe(token);

      expect(response.body.id).toBe(user.id);
      expect(response.body.name).toBe('Second');
      expect(response.body.email).toBe('second@example.com');
    });

    it('never exposes password, token or the internal avatar path', async () => {
      const { token } = await registerUser(app);

      const response = await getMe(token);

      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.body).not.toHaveProperty('token');
      expect(response.body).not.toHaveProperty('avatarPath');
    });
  });

  describe('authentication', () => {
    it('returns 401 without the Authorization header', async () => {
      const response = await getMe(null);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 with a well-formed but unknown token', async () => {
      const response = await getMe('a'.repeat(64));

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 with a token replaced by a new login', async () => {
      const { token: oldToken } = await registerUser(app);
      await request(app)
        .post('/api/auth/login')
        .send({ email: defaultUser.email, password: defaultUser.password });

      const response = await getMe(oldToken);

      expect(response.status).toBe(401);
    });

    it('returns 401 when the user was deleted', async () => {
      const { token, user } = await registerUser(app);
      await db.delete(users).where(eq(users.id, user.id));

      const response = await getMe(token);

      expect(response.status).toBe(401);
    });
  });
});
