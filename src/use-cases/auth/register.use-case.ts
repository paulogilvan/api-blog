import { AppError } from '../../errors/app-error.ts';
import type { PasswordHasher } from '../../utils/password-hasher.ts';
import type { TokenGenerator } from '../../utils/token-generator.ts';
import type { UserRepository } from '../../repositories/user.repository.ts';
import type { RegisterInput } from '../../schemas/auth.schema.ts';
import type { UseCase } from '../use-case.ts';
import type { AuthSession } from './auth-session.ts';

const emailAlreadyRegistered = () => new AppError('CONFLICT', 'Email already registered');

export class RegisterUseCase implements UseCase<RegisterInput, AuthSession> {
  private readonly userRepository: UserRepository;
  private readonly passwordHasher: PasswordHasher;
  private readonly tokenGenerator: TokenGenerator;

  constructor(
    userRepository: UserRepository,
    passwordHasher: PasswordHasher,
    tokenGenerator: TokenGenerator,
  ) {
    this.userRepository = userRepository;
    this.passwordHasher = passwordHasher;
    this.tokenGenerator = tokenGenerator;
  }

  async execute(input: RegisterInput): Promise<AuthSession> {
    if (await this.userRepository.existsByEmail(input.email)) {
      throw emailAlreadyRegistered();
    }

    const passwordHash = await this.passwordHasher.hash(input.password);
    const token = this.tokenGenerator.generate();

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
}
