import type { PostRepository, PostWithAuthorRecord } from '../../repositories/post.repository.ts';
import type { CreatePostInput } from '../../schemas/post.schema.ts';
import type { UseCase } from '../use-case.ts';
import type { PostAuthor } from './post-ownership.ts';

export type CreatePostUseCaseInput = { data: CreatePostInput; author: PostAuthor };

export class CreatePostUseCase implements UseCase<CreatePostUseCaseInput, PostWithAuthorRecord> {
  private readonly postRepository: PostRepository;

  constructor(postRepository: PostRepository) {
    this.postRepository = postRepository;
  }

  async execute({ data, author }: CreatePostUseCaseInput): Promise<PostWithAuthorRecord> {
    const post = await this.postRepository.create({
      title: data.title,
      content: data.content,
      authorId: author.id,
    });

    // Post recém-criado ainda não tem likes.
    return { ...post, likesCount: 0, author: { id: author.id, name: author.name } };
  }
}
