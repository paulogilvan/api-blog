import type { NewReplyEmailData } from '../emails/new-reply.email.ts';

/**
 * Payload do job de e-mail de nova reply: os dados já prontos para montar e enviar o e-mail,
 * sem precisar voltar ao banco (o post ou a reply podem até ter sido apagados até lá).
 * `to` é o e-mail do autor do post: fica só no job, nunca nos DTOs nem nos logs.
 */
export type NewReplyEmailJob = NewReplyEmailData & { to: string };

/** Abstração da criação de jobs de e-mail: os use cases dependem só disto, nunca do BullMQ. */
export interface EmailJobRepository {
  /** Agenda o envio do e-mail de nova reply. Rejeita se o job não puder ser gravado. */
  createNewReplyEmailJob(job: NewReplyEmailJob): Promise<void>;
}
