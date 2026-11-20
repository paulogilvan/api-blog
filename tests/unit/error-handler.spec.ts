import { DrizzleQueryError } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../src/middlewares/error-handler.ts';

function createResponse() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

function run(error: unknown) {
  const res = createResponse();
  errorHandler(error, {} as Request, res as unknown as Response, vi.fn() as NextFunction);
  return res;
}

describe('errorHandler — unexpected errors', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('responds 500 with the INTERNAL_ERROR envelope', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = run(new Error('boom'));

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
    });
  });

  it('never logs query params (password hash, session token) from database errors', () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pgError = Object.assign(new Error('value too long for type character varying(255)'), {
      code: '22001',
    });
    const error = new DrizzleQueryError(
      'insert into "users" ("name", "email", "password", "token") values ($1, $2, $3, $4)',
      ['John', 'john@example.com', '$2b$10$SECRET_PASSWORD_HASH', 'SECRET_SESSION_TOKEN'],
      pgError,
    );

    const res = run(error);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(logSpy).toHaveBeenCalled();

    const logged = logSpy.mock.calls
      .flat()
      .map((arg) => (arg instanceof Error ? `${arg.message} ${arg.stack}` : JSON.stringify(arg)))
      .join(' ');

    expect(logged).not.toContain('SECRET_PASSWORD_HASH');
    expect(logged).not.toContain('SECRET_SESSION_TOKEN');
    expect(logged).not.toContain('john@example.com');
    // Mantém o que é útil para depuração.
    expect(logged).toContain('value too long');
    expect(logged).toContain('22001');
  });
});
