import { AppError } from '../../errors/app-error.ts';
import type { PasswordHasher } from '../../utils/password-hasher.ts';
import type { TokenGenerator } from '../../utils/token-generator.ts';
import type { UserRepository } from '../../repositories/user.repository.ts';
import type { LoginInput } from '../../schemas/auth.schema.ts';
import type { UseCase } from '../use-case.ts';
import type { AuthSession } from './auth-session.ts';

export class LoginUseCase implements UseCase<LoginInput, AuthSession> {
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

  async execute(input: LoginInput): Promise<AuthSession> {
    const userWithPassword = await this.userRepository.findByEmailWithPassword(input.email);

    // Verifica mesmo sem usuário, para o tempo de resposta não revelar se o e-mail existe.
    const passwordMatches = await this.passwordHasher.verify(
      input.password,
      userWithPassword?.passwordHash ?? null,
    );

    if (!userWithPassword || !passwordMatches) {
      throw new AppError('UNAUTHORIZED', 'Invalid email or password');
    }

    const token = this.tokenGenerator.generate();
    await this.userRepository.updateToken(userWithPassword.id, token);

    // Só os campos públicos: o hash da senha não sai do use case.
    const { id, name, email, avatarPath } = userWithPassword;
    return { user: { id, name, email, avatarPath }, token };
  }
}
