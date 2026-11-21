import type { PostRepository, PostWithAuthorRecord } from '../../repositories/post.repository.ts';
import type { UseCase } from '../use-case.ts';
import { postNotFound } from './post-ownership.ts';

export type GetPostInput = { postId: number };

export class GetPostUseCase implements UseCase<GetPostInput, PostWithAuthorRecord> {
  private readonly postRepository: PostRepository;

  constructor(postRepository: PostRepository) {
    this.postRepository = postRepository;
  }

  async execute({ postId }: GetPostInput): Promise<PostWithAuthorRecord> {
    const post = await this.postRepository.findById(postId);

    if (!post) throw postNotFound();

    return post;
  }
}
