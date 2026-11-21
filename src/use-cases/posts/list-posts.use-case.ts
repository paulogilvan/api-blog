import type { PostRepository, PostWithAuthorRecord } from '../../repositories/post.repository.ts';
import type { UseCase } from '../use-case.ts';

export const POSTS_PER_PAGE = 10;

export type ListPostsInput = { page: number };

export type ListPostsOutput = { posts: PostWithAuthorRecord[]; total: number; limit: number };

export class ListPostsUseCase implements UseCase<ListPostsInput, ListPostsOutput> {
  private readonly postRepository: PostRepository;

  constructor(postRepository: PostRepository) {
    this.postRepository = postRepository;
  }

  async execute({ page }: ListPostsInput): Promise<ListPostsOutput> {
    const limit = POSTS_PER_PAGE;
    const offset = (page - 1) * limit;

    const { rows, total } = await this.postRepository.findMany({ limit, offset });

    return { posts: rows, total, limit };
  }
}
