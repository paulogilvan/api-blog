import type { RequestHandler } from 'express';
import { toAuthOutputDTO } from '../dtos/auth-output.dto.ts';
import { BcryptPasswordHasher } from '../utils/bcrypt-password-hasher.ts';
import { CryptoTokenGenerator } from '../utils/crypto-token-generator.ts';
import type { PasswordHasher } from '../utils/password-hasher.ts';
import type { TokenGenerator } from '../utils/token-generator.ts';
import { DrizzleUserRepository } from '../repositories/drizzle-user.repository.ts';
import type { UserRepository } from '../repositories/user.repository.ts';
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from '../schemas/auth.schema.ts';
import type { AuthSession } from '../use-cases/auth/auth-session.ts';
import { LoginUseCase } from '../use-cases/auth/login.use-case.ts';
import { RegisterUseCase } from '../use-cases/auth/register.use-case.ts';
import type { UseCase } from '../use-cases/use-case.ts';

// Composição: as implementações concretas são ligadas uma única vez, fora dos handlers.
// Os handlers só conhecem a abstração `UseCase`.
const userRepository: UserRepository = new DrizzleUserRepository();
const passwordHasher: PasswordHasher = new BcryptPasswordHasher();
const tokenGenerator: TokenGenerator = new CryptoTokenGenerator();

const register: UseCase<RegisterInput, AuthSession> = new RegisterUseCase(
  userRepository,
  passwordHasher,
  tokenGenerator,
);
const login: UseCase<LoginInput, AuthSession> = new LoginUseCase(
  userRepository,
  passwordHasher,
  tokenGenerator,
);

export const registerController: RequestHandler = async (req, res) => {
  const input = registerSchema.parse(req.body);
  const session = await register.execute(input);
  res.status(201).json(toAuthOutputDTO(session));
};

export const loginController: RequestHandler = async (req, res) => {
  const input = loginSchema.parse(req.body);
  const session = await login.execute(input);
  res.status(200).json(toAuthOutputDTO(session));
};
