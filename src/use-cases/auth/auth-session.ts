import type { UserRecord } from '../../repositories/user.repository.ts';

export type AuthenticatedUser = UserRecord;

/** Sessão autenticada: quem é o usuário e qual token foi emitido (dado de domínio, não o JSON da API). */
export type AuthSession = { user: UserRecord; token: string };
