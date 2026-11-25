import { errorCode } from '../../errors/error-code.ts';
import type { EmailJobRepository } from '../../repositories/email-job.repository.ts';
import type { PostRepository } from '../../repositories/post.repository.ts';
import type {
  ReplyRecord,
  ReplyRepository,
  ReplyWithAuthorRecord,
} from '../../repositories/reply.repository.ts';
import type { CreateReplyBody } from '../../schemas/reply.schema.ts';
import { postNotFound, type PostAuthor } from '../posts/post-ownership.ts';
import type { UseCase } from '../use-case.ts';

export type CreateReplyInput = { postId: number; data: CreateReplyBody; author: PostAuthor };

export class CreateReplyUseCase implements UseCase<CreateReplyInput, ReplyWithAuthorRecord> {
  private readonly replyRepository: ReplyRepository;
  private readonly postRepository: PostRepository;
  private readonly emailJobRepository: EmailJobRepository;

  constructor(
    replyRepository: ReplyRepository,
    postRepository: PostRepository,
    emailJobRepository: EmailJobRepository,
  ) {
    this.replyRepository = replyRepository;
    this.postRepository = postRepository;
    this.emailJobRepository = emailJobRepository;
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
   * Agenda o e-mail para o autor do post (o envio acontece no worker da fila). A reply já está
   * criada: nenhuma falha aqui (busca do destinatário ou fila) pode mudar a resposta, então tudo
   * é capturado e só vai para o log.
   */
  private async notifyPostAuthor(postId: number, reply: ReplyRecord, replier: PostAuthor) {
    try {
      const post = await this.postRepository.findWithAuthorContact(postId);

      // Post apagado logo depois da reply (sem destinatário) ou auto-reply: nada a enviar.
      if (!post || post.author.id === replier.id) return;

      // Payload com os dados prontos: o worker não precisa voltar ao banco.
      await this.emailJobRepository.createNewReplyEmailJob({
        to: post.author.email,
        recipientName: post.author.name,
        replierName: replier.name,
        postTitle: post.title,
        replyContent: reply.content,
      });
    } catch (error) {
      // Só ids e o código do erro: mensagens de erro podem citar o destinatário, e o conteúdo
      // da reply não deve ir para o log.
      console.error('Failed to enqueue new reply e-mail:', {
        postId,
        replyId: reply.id,
        error: errorCode(error),
      });
    }
  }
}
