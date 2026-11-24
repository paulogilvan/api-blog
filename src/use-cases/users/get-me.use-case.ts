import { AppError } from '../../errors/app-error.ts';
import type { UserProfileRecord, UserRepository } from '../../repositories/user.repository.ts';
import type { UseCase } from '../use-case.ts';

export type GetMeInput = { userId: number };

export class GetMeUseCase implements UseCase<GetMeInput, UserProfileRecord> {
  private readonly userRepository: UserRepository;

  constructor(userRepository: UserRepository) {
    this.userRepository = userRepository;
  }

  async execute({ userId }: GetMeInput): Promise<UserProfileRecord> {
    const user = await this.userRepository.findProfileById(userId);

    // Usuário apagado entre a autenticação e a leitura: o token deixou de valer.
    if (!user) throw new AppError('UNAUTHORIZED', 'Missing or invalid token');

    return user;
  }
}
