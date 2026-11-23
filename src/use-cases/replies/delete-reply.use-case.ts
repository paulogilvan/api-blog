import { AppError } from '../../errors/app-error.ts';
import type { ReplyRepository } from '../../repositories/reply.repository.ts';
import type { UseCase } from '../use-case.ts';

export type DeleteReplyInput = { postId: number; replyId: number; userId: number };

const replyNotFound = () => new AppError('NOT_FOUND', 'Reply not found');

export class DeleteReplyUseCase implements UseCase<DeleteReplyInput, void> {
  private readonly replyRepository: ReplyRepository;

  constructor(replyRepository: ReplyRepository) {
    this.replyRepository = replyRepository;
  }

  async execute({ postId, replyId, userId }: DeleteReplyInput): Promise<void> {
    // A reply é buscada dentro do post da URL: reply de outro post é 404, e a posse só é
    // checada depois (assim não se revela, via 403, que a reply existe em outro post).
    const authorId = await this.replyRepository.findAuthorId({ replyId, postId });

    if (authorId === null) throw replyNotFound();

    // Só o autor da reply pode apagá-la — nem o dono do post tem esse poder.
    if (authorId !== userId) {
      throw new AppError('FORBIDDEN', 'You can only delete your own replies');
    }

    const deleted = await this.replyRepository.delete({ replyId, postId });

    // Reply (ou o post, em cascata) apagada entre a checagem e o delete.
    if (!deleted) throw replyNotFound();
  }
}
