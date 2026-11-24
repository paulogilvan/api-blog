import type { PostRepository } from '../../repositories/post.repository.ts';
import type { FileStorage } from '../../utils/file-storage.ts';
import type { UseCase } from '../use-case.ts';
import { ensurePostOwnership, postNotFound } from './post-ownership.ts';

export type DeletePostInput = { postId: number; userId: number };

export class DeletePostUseCase implements UseCase<DeletePostInput, void> {
  private readonly postRepository: PostRepository;
  private readonly fileStorage: FileStorage;

  constructor(postRepository: PostRepository, fileStorage: FileStorage) {
    this.postRepository = postRepository;
    this.fileStorage = fileStorage;
  }

  async execute({ postId, userId }: DeletePostInput): Promise<void> {
    await ensurePostOwnership(
      this.postRepository,
      postId,
      userId,
      'You can only delete your own posts',
    );

    const deleted = await this.postRepository.delete(postId);

    if (!deleted) throw postNotFound();

    // A imagem só é apagada depois do post sair do banco. Se o disco falhar, o post já foi
    // apagado: a falha vira um arquivo órfão registrado em log, não um erro na resposta.
    if (deleted.imagePath) {
      try {
        await this.fileStorage.delete(deleted.imagePath);
      } catch (error) {
        console.error('Failed to delete post image file:', error);
      }
    }
  }
}
