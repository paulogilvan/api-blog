import { AppError } from '../../errors/app-error.ts';
import type { UserProfileRecord, UserRepository } from '../../repositories/user.repository.ts';
import type { FileStorage } from '../../utils/file-storage.ts';
import type { ImageProcessor } from '../../utils/image-processor.ts';
import type { UseCase } from '../use-case.ts';

export type UpdateAvatarInput = { userId: number; image: Buffer };

export class UpdateAvatarUseCase implements UseCase<UpdateAvatarInput, UserProfileRecord> {
  private readonly userRepository: UserRepository;
  private readonly imageProcessor: ImageProcessor;
  private readonly fileStorage: FileStorage;

  constructor(
    userRepository: UserRepository,
    imageProcessor: ImageProcessor,
    fileStorage: FileStorage,
  ) {
    this.userRepository = userRepository;
    this.imageProcessor = imageProcessor;
    this.fileStorage = fileStorage;
  }

  async execute({ userId, image }: UpdateAvatarInput): Promise<UserProfileRecord> {
    // Processa antes de tocar o disco: imagem inválida não deixa nenhum arquivo para trás.
    const avatar = await this.imageProcessor.process(image, 'avatar');
    const avatarPath = await this.fileStorage.save('avatars', avatar, 'webp');

    // O disco não participa da transação do banco: se a escrita falhar, a compensação
    // é apagar o arquivo recém-gravado.
    let result: Awaited<ReturnType<UserRepository['updateAvatarPath']>>;
    try {
      result = await this.userRepository.updateAvatarPath(userId, avatarPath);
    } catch (error) {
      await this.deleteQuietly(avatarPath);
      throw error;
    }

    if (!result) {
      // Usuário apagado entre a autenticação e a escrita: o token deixou de valer.
      await this.deleteQuietly(avatarPath);
      throw new AppError('UNAUTHORIZED', 'Missing or invalid token');
    }

    // Só depois do banco gravado o arquivo antigo pode sumir.
    if (result.previousAvatarPath && result.previousAvatarPath !== avatarPath) {
      await this.deleteQuietly(result.previousAvatarPath);
    }

    return result.user;
  }

  /**
   * Apaga sem propagar falhas: na compensação, o erro relevante é o original; na limpeza do
   * avatar antigo, a troca já foi concluída. O pior caso é um arquivo órfão, registrado em log.
   */
  private async deleteQuietly(relativePath: string) {
    try {
      await this.fileStorage.delete(relativePath);
    } catch (error) {
      console.error('Failed to delete avatar file:', error);
    }
  }
}
