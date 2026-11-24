/** `avatarPath` é o caminho relativo a UPLOAD_DIR (ou `null`); a URL pública é montada no DTO. */
export type UserRecord = { id: number; name: string; email: string; avatarPath: string | null };

export type UserWithPasswordRecord = UserRecord & { passwordHash: string };

/** Dados do próprio usuário (formato `Me`): acrescenta a data de cadastro. */
export type UserProfileRecord = UserRecord & { createdAt: Date };

/** Abstração de persistência de usuários: os use cases dependem só disto, nunca do ORM. */
export interface UserRepository {
  existsByEmail(email: string): Promise<boolean>;
  findByEmailWithPassword(email: string): Promise<UserWithPasswordRecord | null>;
  findByToken(token: string): Promise<UserRecord | null>;
  findProfileById(id: number): Promise<UserProfileRecord | null>;
  /** Retorna `null` se o e-mail já existir (violação de unicidade). */
  create(data: {
    name: string;
    email: string;
    passwordHash: string;
    token: string;
  }): Promise<UserRecord | null>;
  updateToken(id: number, token: string): Promise<void>;
  /**
   * Troca o avatar e retorna o caminho anterior (para o arquivo antigo ser apagado).
   * Retorna `null` se o usuário não existir mais.
   */
  updateAvatarPath(
    id: number,
    avatarPath: string,
  ): Promise<{ user: UserProfileRecord; previousAvatarPath: string | null } | null>;
}
