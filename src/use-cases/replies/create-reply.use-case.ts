import type {
  ReplyRepository,
  ReplyWithAuthorRecord,
} from '../../repositories/reply.repository.ts';
import type { CreateReplyBody } from '../../schemas/reply.schema.ts';
import { postNotFound, type PostAuthor } from '../posts/post-ownership.ts';
import type { UseCase } from '../use-case.ts';

export type CreateReplyInput = { postId: number; data: CreateReplyBody; author: PostAuthor };

export class CreateReplyUseCase implements UseCase<CreateReplyInput, ReplyWithAuthorRecord> {
  private readonly replyRepository: ReplyRepository;

  constructor(replyRepository: ReplyRepository) {
    this.replyRepository = replyRepository;
  }

  async execute({ postId, data, author }: CreateReplyInput): Promise<ReplyWithAuthorRecord> {
    const reply = await this.replyRepository.create({
      content: data.content,
      postId,
      authorId: author.id,
    });

    if (!reply) throw postNotFound();

    // O autor da reply é o próprio usuário autenticado.
    return { ...reply, author: { id: author.id, name: author.name } };
  }
}
