import type { PostRepository, PostWithAuthorRecord } from '../../repositories/post.repository.ts';
import type { FileStorage } from '../../utils/file-storage.ts';
import type { ImageProcessor } from '../../utils/image-processor.ts';
import type { UseCase } from '../use-case.ts';
import { ensurePostOwnership, postNotFound, type PostAuthor } from './post-ownership.ts';

export type UpdatePostImageInput = { postId: number; image: Buffer; user: PostAuthor };

export class UpdatePostImageUseCase implements UseCase<UpdatePostImageInput, PostWithAuthorRecord> {
  private readonly postRepository: PostRepository;
  private readonly imageProcessor: ImageProcessor;
  private readonly fileStorage: FileStorage;

  constructor(
    postRepository: PostRepository,
    imageProcessor: ImageProcessor,
    fileStorage: FileStorage,
  ) {
    this.postRepository = postRepository;
    this.imageProcessor = imageProcessor;
    this.fileStorage = fileStorage;
  }

  async execute({ postId, image, user }: UpdatePostImageInput): Promise<PostWithAuthorRecord> {
    // Existência (404) e posse (403) antes de decodificar: não gasta CPU com post alheio.
    await ensurePostOwnership(
      this.postRepository,
      postId,
      user.id,
      'You can only update your own posts',
    );

    // Processa antes de tocar o disco: imagem inválida não deixa nenhum arquivo para trás.
    const processed = await this.imageProcessor.process(image, 'post');
    const imagePath = await this.fileStorage.save('posts', processed, 'webp');

    // O disco não participa da transação do banco: se a escrita falhar, a compensação
    // é apagar o arquivo recém-gravado.
    let result: Awaited<ReturnType<PostRepository['updateImagePath']>>;
    try {
      result = await this.postRepository.updateImagePath(postId, imagePath);
    } catch (error) {
      await this.deleteQuietly(imagePath);
      throw error;
    }

    if (!result) {
      // Post apagado entre a checagem de posse e a escrita.
      await this.deleteQuietly(imagePath);
      throw postNotFound();
    }

    // Só depois do banco gravado o arquivo antigo pode sumir.
    if (result.previousImagePath && result.previousImagePath !== imagePath) {
      await this.deleteQuietly(result.previousImagePath);
    }

    // O dono do post é o próprio usuário autenticado.
    return { ...result.post, author: { id: user.id, name: user.name } };
  }

  /**
   * Apaga sem propagar falhas: na compensação, o erro relevante é o original; na limpeza da
   * imagem antiga, a troca já foi concluída. O pior caso é um arquivo órfão, registrado em log.
   */
  private async deleteQuietly(relativePath: string) {
    try {
      await this.fileStorage.delete(relativePath);
    } catch (error) {
      console.error('Failed to delete post image file:', error);
    }
  }
}
