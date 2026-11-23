import type { LikeRepository } from '../../repositories/like.repository.ts';
import type { PostRepository, PostWithAuthorRecord } from '../../repositories/post.repository.ts';
import type {
  ReplyRepository,
  ReplyWithAuthorRecord,
} from '../../repositories/reply.repository.ts';
import type { UseCase } from '../use-case.ts';
import { postNotFound } from './post-ownership.ts';

/** `viewerId` é o usuário do token (autenticação opcional) ou `null` em acesso anônimo. */
export type GetPostInput = { postId: number; viewerId: number | null };

/** Post individual: dados públicos, replies e informações relativas a quem está vendo. */
export type PostDetailRecord = PostWithAuthorRecord & {
  likedByMe: boolean;
  replies: ReplyWithAuthorRecord[];
};

export class GetPostUseCase implements UseCase<GetPostInput, PostDetailRecord> {
  private readonly postRepository: PostRepository;
  private readonly likeRepository: LikeRepository;
  private readonly replyRepository: ReplyRepository;

  constructor(
    postRepository: PostRepository,
    likeRepository: LikeRepository,
    replyRepository: ReplyRepository,
  ) {
    this.postRepository = postRepository;
    this.likeRepository = likeRepository;
    this.replyRepository = replyRepository;
  }

  async execute({ postId, viewerId }: GetPostInput): Promise<PostDetailRecord> {
    const post = await this.postRepository.findById(postId);

    if (!post) throw postNotFound();

    const [replies, likedByMe] = await Promise.all([
      this.replyRepository.findManyByPostId(postId),
      // Anônimo nunca "curtiu"; só consulta o banco quando há usuário autenticado.
      viewerId !== null
        ? this.likeRepository.exists({ postId, userId: viewerId })
        : Promise.resolve(false),
    ]);

    // O contador vem da lista devolvida: as duas leituras são consultas separadas e uma
    // reply criada/apagada entre elas faria `repliesCount` divergir de `replies.length`.
    return { ...post, repliesCount: replies.length, likedByMe, replies };
  }
}
