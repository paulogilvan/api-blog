import type { PostRepository } from '../../repositories/post.repository.ts';
import type { UseCase } from '../use-case.ts';
import { ensurePostOwnership, postNotFound } from './post-ownership.ts';

export type DeletePostInput = { postId: number; userId: number };

export class DeletePostUseCase implements UseCase<DeletePostInput, void> {
  private readonly postRepository: PostRepository;

  constructor(postRepository: PostRepository) {
    this.postRepository = postRepository;
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
  }
}
