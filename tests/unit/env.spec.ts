import { describe, expect, it } from 'vitest';
import { envSchema } from '../../src/env.ts';

const validEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:6001/blog_test',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1026',
  SMTP_FROM: 'Blog API <no-reply@blog.local>',
};

function parse(overrides: Record<string, string | undefined> = {}) {
  return envSchema.safeParse({ ...validEnv, ...overrides });
}

function errorPaths(result: ReturnType<typeof parse>) {
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('envSchema (SMTP)', () => {
  it('accepts host, port and sender without credentials', () => {
    const result = parse();

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      SMTP_HOST: 'localhost',
      SMTP_PORT: 1026,
      SMTP_FROM: 'Blog API <no-reply@blog.local>',
    });
    expect(result.data?.SMTP_USER).toBeUndefined();
    expect(result.data?.SMTP_PASS).toBeUndefined();
  });

  it('treats empty credentials (as in .env.example) as not set', () => {
    const result = parse({ SMTP_USER: '', SMTP_PASS: '' });

    expect(result.success).toBe(true);
    expect(result.data?.SMTP_USER).toBeUndefined();
    expect(result.data?.SMTP_PASS).toBeUndefined();
  });

  it('accepts user and password together', () => {
    const result = parse({ SMTP_USER: 'mailer', SMTP_PASS: 'secret' });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ SMTP_USER: 'mailer', SMTP_PASS: 'secret' });
  });

  it.each([
    ['SMTP_USER', { SMTP_USER: 'mailer' }],
    ['SMTP_PASS', { SMTP_PASS: 'secret' }],
  ])('rejects %s without the other credential', (_name, overrides) => {
    const result = parse(overrides);

    expect(result.success).toBe(false);
  });

  it.each(['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM'])('requires %s', (name) => {
    const result = parse({ [name]: undefined });

    expect(errorPaths(result)).toContain(name);
  });

  it.each(['0', '65536', 'abc', '1.5', ''])('rejects SMTP_PORT "%s"', (port) => {
    const result = parse({ SMTP_PORT: port });

    expect(errorPaths(result)).toContain('SMTP_PORT');
  });

  it.each(['', '   '])('rejects a blank SMTP_HOST', (host) => {
    expect(errorPaths(parse({ SMTP_HOST: host }))).toContain('SMTP_HOST');
  });

  it.each(['no-reply@blog.local', 'Blog API <no-reply@blog.local>'])(
    'accepts SMTP_FROM "%s"',
    (from) => {
      expect(parse({ SMTP_FROM: from }).success).toBe(true);
    },
  );

  it.each(['not-an-email', 'Blog API <not-an-email>', 'Blog API'])(
    'rejects SMTP_FROM "%s"',
    (from) => {
      expect(errorPaths(parse({ SMTP_FROM: from }))).toContain('SMTP_FROM');
    },
  );
});
