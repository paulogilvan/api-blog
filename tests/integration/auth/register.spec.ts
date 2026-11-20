import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.ts';
import { db, pool } from '../../../src/db/index.ts';
import { users } from '../../../src/db/schema.ts';
import { resetDatabase } from '../../helpers/database.ts';

const app = createApp();
const route = '/api/auth/register';

// E-mail com formato válido, porém com 369 caracteres (coluna é varchar(255)).
const longEmail = `${'a'.repeat(60)}@${Array(5).fill('b'.repeat(60)).join('.')}.com`;

const validUser = {
  name: 'John Doe',
  email: 'john@example.com',
  password: 'secret123',
};

describe('POST /api/auth/register', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('success', () => {
    it('returns 201 with token and user data', async () => {
      const response = await request(app).post(route).send(validUser);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        token: expect.any(String),
        user: {
          id: expect.any(Number),
          name: validUser.name,
          email: validUser.email,
        },
      });
      expect(response.body.token.length).toBeGreaterThanOrEqual(32);
    });

    it('never returns the password (nor its hash)', async () => {
      const response = await request(app).post(route).send(validUser);

      expect(response.body.user).not.toHaveProperty('password');
      expect(JSON.stringify(response.body)).not.toContain(validUser.password);
    });

    it('persists the user with a bcrypt hashed password and the session token', async () => {
      const response = await request(app).post(route).send(validUser);

      const [user] = await db.select().from(users).where(eq(users.email, validUser.email));

      expect(user).toBeDefined();
      expect(user.password).not.toBe(validUser.password);
      expect(await bcrypt.compare(validUser.password, user.password)).toBe(true);
      expect(user.token).toBe(response.body.token);
    });

    it('normalizes email to lowercase and trims name', async () => {
      const response = await request(app)
        .post(route)
        .send({ ...validUser, name: '  John Doe  ', email: '  JOHN@Example.COM ' });

      expect(response.status).toBe(201);
      expect(response.body.user.name).toBe('John Doe');
      expect(response.body.user.email).toBe('john@example.com');
    });

    it('accepts a password with exactly 72 bytes', async () => {
      const response = await request(app)
        .post(route)
        .send({ ...validUser, password: 'é'.repeat(36) });

      expect(response.status).toBe(201);
    });

    it('accepts boundary values (name with 100 chars, password with 6 chars)', async () => {
      const response = await request(app)
        .post(route)
        .send({ ...validUser, name: 'a'.repeat(100), password: '123456' });

      expect(response.status).toBe(201);
      expect(response.body.user.name).toHaveLength(100);
    });

    it('never returns the bcrypt hash', async () => {
      const response = await request(app).post(route).send(validUser);

      expect(JSON.stringify(response.body)).not.toContain('$2b$');
    });

    it('generates a different token for each user', async () => {
      const first = await request(app).post(route).send(validUser);
      const second = await request(app)
        .post(route)
        .send({ ...validUser, email: 'jane@example.com' });

      expect(first.body.token).not.toBe(second.body.token);
    });
  });

  describe('conflict', () => {
    it('returns 409 when email is already registered', async () => {
      await request(app).post(route).send(validUser);

      const response = await request(app).post(route).send(validUser);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('treats email as case-insensitive when checking uniqueness', async () => {
      await request(app).post(route).send(validUser);

      const response = await request(app)
        .post(route)
        .send({ ...validUser, email: 'JOHN@EXAMPLE.COM' });

      expect(response.status).toBe(409);
    });

    it('returns the contract error envelope and message', async () => {
      await request(app).post(route).send(validUser);

      const response = await request(app).post(route).send(validUser);

      expect(response.body).toEqual({
        error: { code: 'CONFLICT', message: 'Email already registered' },
      });
    });

    it('creates only one user when the same email is registered concurrently', async () => {
      const responses = await Promise.all(
        Array.from({ length: 5 }, () => request(app).post(route).send(validUser)),
      );

      const statuses = responses.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409, 409, 409, 409]);
      expect(await db.select().from(users)).toHaveLength(1);
    });
  });

  describe('validation', () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['name is missing', { email: validUser.email, password: validUser.password }, 'name'],
      ['name is empty after trim', { ...validUser, name: '   ' }, 'name'],
      ['name is longer than 100 chars', { ...validUser, name: 'a'.repeat(101) }, 'name'],
      ['name is not a string', { ...validUser, name: 123 }, 'name'],
      ['name is null', { ...validUser, name: null }, 'name'],
      ['email is missing', { name: validUser.name, password: validUser.password }, 'email'],
      ['email is invalid', { ...validUser, email: 'not-an-email' }, 'email'],
      ['email is not a string', { ...validUser, email: 123 }, 'email'],
      ['email is null', { ...validUser, email: null }, 'email'],
      ['email is longer than 255 chars', { ...validUser, email: longEmail }, 'email'],
      ['password is missing', { name: validUser.name, email: validUser.email }, 'password'],
      ['password has less than 6 chars', { ...validUser, password: '12345' }, 'password'],
      ['password is not a string', { ...validUser, password: 123456 }, 'password'],
      // bcrypt ignora tudo após 72 bytes — senhas maiores seriam truncadas em silêncio.
      ['password is longer than 72 bytes', { ...validUser, password: 'a'.repeat(73) }, 'password'],
      [
        'password has 37 multibyte chars (74 bytes)',
        { ...validUser, password: 'é'.repeat(37) },
        'password',
      ],
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
        .send('{"name": "John",');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('does not persist anything when input is invalid', async () => {
      await request(app).post(route).send({ ...validUser, email: 'invalid' });

      const rows = await db.select().from(users);
      expect(rows).toHaveLength(0);
    });
  });
});
