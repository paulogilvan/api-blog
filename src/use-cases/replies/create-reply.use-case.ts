import { buildNewReplyEmail } from '../../emails/new-reply.email.ts';
import type { PostRepository } from '../../repositories/post.repository.ts';
import type {
  ReplyRecord,
  ReplyRepository,
  ReplyWithAuthorRecord,
} from '../../repositories/reply.repository.ts';
import type { CreateReplyBody } from '../../schemas/reply.schema.ts';
import type { Mailer } from '../../utils/mailer.ts';
import { postNotFound, type PostAuthor } from '../posts/post-ownership.ts';
import type { UseCase } from '../use-case.ts';

export type CreateReplyInput = { postId: number; data: CreateReplyBody; author: PostAuthor };

export class CreateReplyUseCase implements UseCase<CreateReplyInput, ReplyWithAuthorRecord> {
  private readonly replyRepository: ReplyRepository;
  private readonly postRepository: PostRepository;
  private readonly mailer: Mailer;

  constructor(replyRepository: ReplyRepository, postRepository: PostRepository, mailer: Mailer) {
    this.replyRepository = replyRepository;
    this.postRepository = postRepository;
    this.mailer = mailer;
  }

  async execute({ postId, data, author }: CreateReplyInput): Promise<ReplyWithAuthorRecord> {
    const reply = await this.replyRepository.create({
      content: data.content,
      postId,
      authorId: author.id,
    });

    if (!reply) throw postNotFound();

    await this.notifyPostAuthor(postId, reply, author);

    // O autor da reply é o próprio usuário autenticado.
    return { ...reply, author: { id: author.id, name: author.name } };
  }

  /**
   * Avisa o autor do post por e-mail. A reply já está criada: nenhuma falha aqui (busca do
   * destinatário ou SMTP) pode mudar a resposta, então tudo é capturado e só vai para o log.
   */
  private async notifyPostAuthor(postId: number, reply: ReplyRecord, replier: PostAuthor) {
    try {
      const post = await this.postRepository.findWithAuthorContact(postId);

      // Post apagado logo depois da reply (sem destinatário) ou auto-reply: nada a enviar.
      if (!post || post.author.id === replier.id) return;

      const email = buildNewReplyEmail({
        recipientName: post.author.name,
        replierName: replier.name,
        postTitle: post.title,
        replyContent: reply.content,
      });
      await this.mailer.send({ to: post.author.email, ...email });
    } catch (error) {
      // Só ids e o código do erro: mensagens de SMTP costumam citar o destinatário, e o
      // conteúdo da reply não deve ir para o log.
      console.error('Failed to send new reply e-mail:', {
        postId,
        replyId: reply.id,
        error: errorCode(error),
      });
    }
  }
}

function errorCode(error: unknown): string {
  if (error instanceof Error) {
    const { code } = error as Error & { code?: unknown };
    return typeof code === 'string' ? code : error.name;
  }
  return 'UnknownError';
}
