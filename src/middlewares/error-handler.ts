import { DrizzleQueryError } from 'drizzle-orm';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error.ts';

/**
 * Prepara o erro para log sem vazar dados sensíveis.
 * O DrizzleQueryError embute os params da query (hash de senha, token, e-mail)
 * na mensagem e no stack — por isso logamos só a query parametrizada e a causa.
 */
function toLoggableError(err: unknown) {
  if (err instanceof DrizzleQueryError) {
    const cause = err.cause as { message?: string; code?: string } | undefined;
    return {
      name: err.name,
      query: err.query,
      cause: cause ? { message: cause.message, code: cause.code } : undefined,
    };
  }
  return err;
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError('NOT_FOUND', 'Route not found'));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  // Body com JSON malformado (lançado pelo express.json()).
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Malformed JSON body' },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  console.error('Unexpected error:', toLoggableError(err));
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
};
