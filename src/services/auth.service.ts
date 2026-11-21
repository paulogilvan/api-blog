import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { env } from '../env.ts';
import { AppError } from '../errors/app-error.ts';
import type { UserRecord, UserRepository } from '../repositories/user.repository.ts';
import type { LoginInput, RegisterInput } from '../schemas/auth.schema.ts';

// Custo menor em testes para não deixar a suíte lenta.
const BCRYPT_ROUNDS = env.NODE_ENV === 'test' ? 4 : 10;

// Hash usado quando o e-mail não existe: o bcrypt.compare roda do mesmo jeito,
// para o tempo de resposta não revelar se o e-mail está cadastrado.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);

export type AuthenticatedUser = UserRecord;

/** Sessão autenticada: quem é o usuário e qual token foi emitido (dado de domínio, não o JSON da API). */
export type AuthSession = { user: UserRecord; token: string };

function generateSessionToken() {
  return randomBytes(32).toString('hex');
}

const emailAlreadyRegistered = () => new AppError('CONFLICT', 'Email already registered');

export class AuthService {
  private readonly userRepository: UserRepository;

  constructor(userRepository: UserRepository) {
    this.userRepository = userRepository;
  }

  async register(input: RegisterInput): Promise<AuthSession> {
    if (await this.userRepository.existsByEmail(input.email)) {
      throw emailAlreadyRegistered();
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const token = generateSessionToken();

    const user = await this.userRepository.create({
      name: input.name,
      email: input.email,
      passwordHash,
      token,
    });

    // Corrida entre a checagem e o insert.
    if (!user) throw emailAlreadyRegistered();

    return { user, token };
  }

  async login(input: LoginInput): Promise<AuthSession> {
    const user = await this.userRepository.findByEmailWithPassword(input.email);

    const passwordMatches = await bcrypt.compare(
      input.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordMatches) {
      throw new AppError('UNAUTHORIZED', 'Invalid email or password');
    }

    const token = generateSessionToken();
    await this.userRepository.updateToken(user.id, token);

    return { user, token };
  }

  async findUserByToken(token: string): Promise<AuthenticatedUser | null> {
    return this.userRepository.findByToken(token);
  }
}
