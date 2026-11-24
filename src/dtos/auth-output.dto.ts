import type { AuthSession } from '../use-cases/auth/auth-session.ts';
import { toUploadUrl } from './upload-url.ts';

/** Formato público da resposta de cadastro e login. */
export type AuthOutputDTO = {
  token: string;
  user: { id: number; name: string; email: string; avatarUrl: string | null };
};

// Escolhe os campos explicitamente, então dados internos do usuário
// (ex.: passwordHash, caminho do arquivo em disco) nunca vão para a resposta.
export function toAuthOutputDTO({ token, user }: AuthSession): AuthOutputDTO {
  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: toUploadUrl(user.avatarPath),
    },
  };
}
