import type { LikeRepository } from '../../repositories/like.repository.ts';
import { postNotFound } from '../posts/post-ownership.ts';
import type { UseCase } from '../use-case.ts';
import type { LikesCountRecord } from './likes-count.ts';

export type LikePostInput = { postId: number; userId: number };

export class LikePostUseCase implements UseCase<LikePostInput, LikesCountRecord> {
  private readonly likeRepository: LikeRepository;

  constructor(likeRepository: LikeRepository) {
    this.likeRepository = likeRepository;
  }

  async execute({ postId, userId }: LikePostInput): Promise<LikesCountRecord> {
    const postExists = await this.likeRepository.add({ postId, userId });

    if (!postExists) throw postNotFound();

    const likesCount = await this.likeRepository.countByPostId(postId);
    return { likesCount };
  }
}
