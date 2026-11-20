import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.ts';
import { db, pool } from '../../../src/db/index.ts';
import { users } from '../../../src/db/schema.ts';
import { resetDatabase } from '../../helpers/database.ts';

const app = createApp();
const route = '/api/auth/login';

const registeredUser = {
  name: 'John Doe',
  email: 'john@example.com',
  password: 'secret123',
};

const credentials = { email: registeredUser.email, password: registeredUser.password };

async function registerUser() {
  const response = await request(app).post('/api/auth/register').send(registeredUser);
  return response.body as { token: string; user: { id: number } };
}

async function findStoredToken(email: string) {
  const [user] = await db.select({ token: users.token }).from(users).where(eq(users.email, email));
  return user?.token;
}

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('success', () => {
    it('returns 200 with token and user data', async () => {
      const registered = await registerUser();

      const response = await request(app).post(route).send(credentials);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        token: expect.any(String),
        user: {
          id: registered.user.id,
          name: registeredUser.name,
          email: registeredUser.email,
        },
      });
    });

    it('never returns the password (nor its hash)', async () => {
      await registerUser();

      const response = await request(app).post(route).send(credentials);

      expect(response.body.user).not.toHaveProperty('password');
      expect(JSON.stringify(response.body)).not.toContain(registeredUser.password);
      expect(JSON.stringify(response.body)).not.toContain('$2b$');
    });

    it('generates a new session token and persists it', async () => {
      const registered = await registerUser();

      const response = await request(app).post(route).send(credentials);

      expect(response.body.token).not.toBe(registered.token);
      expect(await findStoredToken(registeredUser.email)).toBe(response.body.token);
    });

    it('replaces the token on every login', async () => {
      await registerUser();

      const first = await request(app).post(route).send(credentials);
      const second = await request(app).post(route).send(credentials);

      expect(second.body.token).not.toBe(first.body.token);
      expect(await findStoredToken(registeredUser.email)).toBe(second.body.token);
    });

    it('accepts email with different casing and surrounding spaces', async () => {
      await registerUser();

      const response = await request(app)
        .post(route)
        .send({ ...credentials, email: '  JOHN@Example.com ' });

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe(registeredUser.email);
    });
  });

  describe('invalid credentials', () => {
    it('returns 401 when password is wrong', async () => {
      await registerUser();

      const response = await request(app)
        .post(route)
        .send({ ...credentials, password: 'wrong-password' });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 when email is not registered', async () => {
      const response = await request(app)
        .post(route)
        .send({ email: 'nobody@example.com', password: 'secret123' });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns the contract error envelope and message', async () => {
      await registerUser();

      const response = await request(app)
        .post(route)
        .send({ ...credentials, password: 'wrong-password' });

      expect(response.body).toEqual({
        error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' },
      });
    });

    it('does not reveal which field failed (same response for both cases)', async () => {
      await registerUser();

      const wrongPassword = await request(app)
        .post(route)
        .send({ ...credentials, password: 'wrong-password' });
      const unknownEmail = await request(app)
        .post(route)
        .send({ email: 'nobody@example.com', password: 'secret123' });

      expect(wrongPassword.status).toBe(unknownEmail.status);
      expect(wrongPassword.body).toEqual(unknownEmail.body);
    });

    it('keeps the current token when login fails', async () => {
      const registered = await registerUser();

      await request(app).post(route).send({ ...credentials, password: 'wrong-password' });

      expect(await findStoredToken(registeredUser.email)).toBe(registered.token);
    });
  });

  describe('validation', () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['email is missing', { password: credentials.password }, 'email'],
      ['email is invalid', { ...credentials, email: 'not-an-email' }, 'email'],
      ['password is missing', { email: credentials.email }, 'password'],
      ['password is empty', { ...credentials, password: '' }, 'password'],
      ['password has less than 6 chars', { ...credentials, password: '12345' }, 'password'],
      ['password is not a string', { ...credentials, password: 123456 }, 'password'],
    ];

    it.each(cases)('returns 400 when %s', async (_label, body, field) => {
      const response = await request(app).post(route).send(body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: field })]),
      );
    });

    it('returns 400 when body is malformed JSON', async () => {
      const response = await request(app)
        .post(route)
        .set('Content-Type', 'application/json')
        .send('{"email": "john@example.com",');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
