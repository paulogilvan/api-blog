import type { LikeRepository } from '../../repositories/like.repository.ts';
import type { PostRepository, PostWithAuthorRecord } from '../../repositories/post.repository.ts';
import type { UseCase } from '../use-case.ts';
import { postNotFound } from './post-ownership.ts';

/** `viewerId` é o usuário do token (autenticação opcional) ou `null` em acesso anônimo. */
export type GetPostInput = { postId: number; viewerId: number | null };

/** Post individual: dados públicos + informações relativas a quem está vendo. */
export type PostDetailRecord = PostWithAuthorRecord & { likedByMe: boolean };

export class GetPostUseCase implements UseCase<GetPostInput, PostDetailRecord> {
  private readonly postRepository: PostRepository;
  private readonly likeRepository: LikeRepository;

  constructor(postRepository: PostRepository, likeRepository: LikeRepository) {
    this.postRepository = postRepository;
    this.likeRepository = likeRepository;
  }

  async execute({ postId, viewerId }: GetPostInput): Promise<PostDetailRecord> {
    const post = await this.postRepository.findById(postId);

    if (!post) throw postNotFound();

    // Anônimo nunca "curtiu"; só consulta o banco quando há usuário autenticado.
    const likedByMe =
      viewerId !== null && (await this.likeRepository.exists({ postId, userId: viewerId }));

    return { ...post, likedByMe };
  }
}
