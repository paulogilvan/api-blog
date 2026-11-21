export type UserRecord = { id: number; name: string; email: string };

export type UserWithPasswordRecord = UserRecord & { passwordHash: string };

/** Abstração de persistência de usuários: os use cases dependem só disto, nunca do ORM. */
export interface UserRepository {
  existsByEmail(email: string): Promise<boolean>;
  findByEmailWithPassword(email: string): Promise<UserWithPasswordRecord | null>;
  findByToken(token: string): Promise<UserRecord | null>;
  /** Retorna `null` se o e-mail já existir (violação de unicidade). */
  create(data: {
    name: string;
    email: string;
    passwordHash: string;
    token: string;
  }): Promise<UserRecord | null>;
  updateToken(id: number, token: string): Promise<void>;
}
