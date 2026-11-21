import type { PostRepository, PostWithAuthorRecord } from '../../repositories/post.repository.ts';
import type { UpdatePostInput } from '../../schemas/post.schema.ts';
import type { UseCase } from '../use-case.ts';
import { ensurePostOwnership, postNotFound, type PostAuthor } from './post-ownership.ts';

export type UpdatePostUseCaseInput = { postId: number; data: UpdatePostInput; user: PostAuthor };

export class UpdatePostUseCase implements UseCase<UpdatePostUseCaseInput, PostWithAuthorRecord> {
  private readonly postRepository: PostRepository;

  constructor(postRepository: PostRepository) {
    this.postRepository = postRepository;
  }

  async execute({ postId, data, user }: UpdatePostUseCaseInput): Promise<PostWithAuthorRecord> {
    await ensurePostOwnership(
      this.postRepository,
      postId,
      user.id,
      'You can only update your own posts',
    );

    const post = await this.postRepository.update(postId, data);

    // Post apagado entre a checagem e o update.
    if (!post) throw postNotFound();

    // O dono do post é o próprio usuário autenticado.
    return { ...post, author: { id: user.id, name: user.name } };
  }
}
