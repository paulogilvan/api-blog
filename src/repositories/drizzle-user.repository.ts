import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import type { UserRepository } from './user.repository.ts';

const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  const cause = (error as { cause?: unknown }).cause;
  return code === PG_UNIQUE_VIOLATION || isUniqueViolation(cause);
}

const userColumns = { id: users.id, name: users.name, email: users.email };

/** Adapter Drizzle para o UserRepository. */
export class DrizzleUserRepository implements UserRepository {
  async existsByEmail(email: string) {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return user !== undefined;
  }

  async findByEmailWithPassword(email: string) {
    const [user] = await db
      .select({ ...userColumns, passwordHash: users.password })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return user ?? null;
  }

  async findByToken(token: string) {
    const [user] = await db.select(userColumns).from(users).where(eq(users.token, token)).limit(1);

    return user ?? null;
  }

  async create(data: { name: string; email: string; passwordHash: string; token: string }) {
    try {
      const [user] = await db
        .insert(users)
        .values({ name: data.name, email: data.email, password: data.passwordHash, token: data.token })
        .returning(userColumns);

      return user;
    } catch (error) {
      // O índice único do banco é a garantia final contra e-mail duplicado.
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  async updateToken(id: number, token: string) {
    await db.update(users).set({ token }).where(eq(users.id, id));
  }
}
