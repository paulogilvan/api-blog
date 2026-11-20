import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { env } from '../env.ts';
import { AppError } from '../errors/app-error.ts';
import type { LoginInput, RegisterInput } from '../schemas/auth.schema.ts';

// Custo menor em testes para não deixar a suíte lenta.
const BCRYPT_ROUNDS = env.NODE_ENV === 'test' ? 4 : 10;

// Hash usado quando o e-mail não existe: o bcrypt.compare roda do mesmo jeito,
// para o tempo de resposta não revelar se o e-mail está cadastrado.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);

const PG_UNIQUE_VIOLATION = '23505';

export type AuthResult = {
  token: string;
  user: { id: number; name: string; email: string };
};

function generateSessionToken() {
  return randomBytes(32).toString('hex');
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  const cause = (error as { cause?: unknown }).cause;
  return code === PG_UNIQUE_VIOLATION || isUniqueViolation(cause);
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (existing) {
    throw new AppError('CONFLICT', 'Email already registered');
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const token = generateSessionToken();

  try {
    const [user] = await db
      .insert(users)
      .values({ name: input.name, email: input.email, password: passwordHash, token })
      .returning({ id: users.id, name: users.name, email: users.email });

    return { token, user };
  } catch (error) {
    // Corrida entre o select e o insert: o índice único do banco é a garantia final.
    if (isUniqueViolation(error)) {
      throw new AppError('CONFLICT', 'Email already registered');
    }
    throw error;
  }
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, password: users.password })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  const passwordMatches = await bcrypt.compare(
    input.password,
    user?.password ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !passwordMatches) {
    throw new AppError('UNAUTHORIZED', 'Invalid email or password');
  }

  const token = generateSessionToken();
  await db.update(users).set({ token }).where(eq(users.id, user.id));

  return { token, user: { id: user.id, name: user.name, email: user.email } };
}

export type AuthenticatedUser = { id: number; name: string; email: string };

export async function findUserByToken(token: string): Promise<AuthenticatedUser | null> {
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.token, token))
    .limit(1);

  return user ?? null;
}
