import type { UserRepository } from '../../repositories/user.repository.ts';
import type { UseCase } from '../use-case.ts';
import type { AuthenticatedUser } from './auth-session.ts';

export type FindUserByTokenInput = { token: string };

export class FindUserByTokenUseCase
  implements UseCase<FindUserByTokenInput, AuthenticatedUser | null>
{
  private readonly userRepository: UserRepository;

  constructor(userRepository: UserRepository) {
    this.userRepository = userRepository;
  }

  async execute({ token }: FindUserByTokenInput): Promise<AuthenticatedUser | null> {
    return this.userRepository.findByToken(token);
  }
}
