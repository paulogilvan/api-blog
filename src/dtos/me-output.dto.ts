import type { UserProfileRecord } from '../repositories/user.repository.ts';
import { toUploadUrl } from './upload-url.ts';

/** Formato público `Me` (dados do próprio usuário autenticado). */
export type MeOutputDTO = {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
};

// Campos escolhidos explicitamente: hash de senha, token e o caminho interno do arquivo nunca saem.
export function toMeOutputDTO(user: UserProfileRecord): MeOutputDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: toUploadUrl(user.avatarPath),
    createdAt: user.createdAt.toISOString(),
  };
}
