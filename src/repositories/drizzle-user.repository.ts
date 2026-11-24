import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { isPgError, PG_UNIQUE_VIOLATION } from './pg-error.ts';
import type { UserRepository } from './user.repository.ts';

const userColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  avatarPath: users.avatarPath,
};

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
      if (isPgError(error, PG_UNIQUE_VIOLATION)) return null;
      throw error;
    }
  }

  async updateToken(id: number, token: string) {
    await db.update(users).set({ token }).where(eq(users.id, id));
  }

  async updateAvatarPath(id: number, avatarPath: string) {
    // Ler o caminho anterior e gravar o novo na mesma transação, com a linha travada (FOR UPDATE):
    // dois uploads simultâneos do mesmo usuário não leem o mesmo "anterior", o que deixaria
    // um arquivo órfão no disco.
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select({ avatarPath: users.avatarPath })
        .from(users)
        .where(eq(users.id, id))
        .for('update');
      if (!current) return null;

      const [user] = await tx
        .update(users)
        .set({ avatarPath })
        .where(eq(users.id, id))
        .returning({ ...userColumns, createdAt: users.createdAt });

      return { user, previousAvatarPath: current.avatarPath };
    });
  }
}
