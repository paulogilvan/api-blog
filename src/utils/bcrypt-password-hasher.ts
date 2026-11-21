import bcrypt from 'bcrypt';
import { env } from '../env.ts';
import type { PasswordHasher } from './password-hasher.ts';

// Custo menor em testes para não deixar a suíte lenta.
const BCRYPT_ROUNDS = env.NODE_ENV === 'test' ? 4 : 10;

// Hash usado quando o e-mail não existe: o bcrypt.compare roda do mesmo jeito,
// para o tempo de resposta não revelar se o e-mail está cadastrado.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);

/** Adapter bcrypt para o PasswordHasher. */
export class BcryptPasswordHasher implements PasswordHasher {
  async hash(plain: string) {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
  }

  async verify(plain: string, hash: string | null) {
    const matches = await bcrypt.compare(plain, hash ?? DUMMY_PASSWORD_HASH);
    return hash !== null && matches;
  }
}
