import type { Request, RequestHandler } from 'express';
import { AppError } from '../errors/app-error.ts';
import { DrizzleUserRepository } from '../repositories/drizzle-user.repository.ts';
import type { AuthenticatedUser } from '../use-cases/auth/auth-session.ts';
import {
  FindUserByTokenUseCase,
  type FindUserByTokenInput,
} from '../use-cases/auth/find-user-by-token.use-case.ts';
import type { UseCase } from '../use-cases/use-case.ts';

// Composição fora do handler: o middleware só conhece a abstração `UseCase`.
const findUserByToken: UseCase<FindUserByTokenInput, AuthenticatedUser | null> =
  new FindUserByTokenUseCase(new DrizzleUserRepository());

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// Tokens de sessão são 32 bytes em hex (64 chars) — qualquer outro formato é rejeitado sem ir ao banco.
const BEARER_PATTERN = /^Bearer ([a-f0-9]{64})$/i;

const unauthorized = () => new AppError('UNAUTHORIZED', 'Missing or invalid token');

/** Resolve o usuário do header `Authorization`; lança 401 se ele for malformado ou inválido. */
async function authenticate(authorization: string | undefined): Promise<AuthenticatedUser> {
  const match = authorization?.trim().match(BEARER_PATTERN);
  if (!match) throw unauthorized();

  const user = await findUserByToken.execute({ token: match[1].toLowerCase() });
  if (!user) throw unauthorized();

  return user;
}

export const ensureAuthenticated: RequestHandler = async (req, _res, next) => {
  req.user = await authenticate(req.headers.authorization);
  next();
};

/**
 * Autenticação opcional: sem header `Authorization` a requisição segue anônima. Com o header
 * presente, ele precisa ser válido (401 caso contrário), para que um token expirado ou com
 * erro de digitação não seja tratado em silêncio como acesso anônimo.
 */
export const optionalAuthentication: RequestHandler = async (req, _res, next) => {
  if (req.headers.authorization !== undefined) {
    req.user = await authenticate(req.headers.authorization);
  }
  next();
};

/** Retorna o usuário autenticado; uso exclusivo em rotas protegidas por `ensureAuthenticated`. */
export function getAuthenticatedUser(req: Request): AuthenticatedUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

/** Retorna o usuário autenticado ou `null`; para rotas com `optionalAuthentication`. */
export function getOptionalUser(req: Request): AuthenticatedUser | null {
  return req.user ?? null;
}
