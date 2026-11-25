import type { Job } from 'bullmq';
import { buildNewReplyEmail } from '../../emails/new-reply.email.ts';
import type { NewReplyEmailJob } from '../../repositories/email-job.repository.ts';
import type { Mailer } from '../../utils/mailer.ts';
import { NEW_REPLY_EMAIL_JOB } from './names.ts';

/**
 * Processador da fila de e-mails. Monta o e-mail a partir do payload pronto e envia; não vai
 * ao banco. Um erro é relançado para o BullMQ tentar de novo (ver `attempts` em `queue.ts`).
 */
export function createEmailProcessor(mailer: Mailer) {
  return async (job: Pick<Job<NewReplyEmailJob>, 'name' | 'data'>) => {
    if (job.name !== NEW_REPLY_EMAIL_JOB) {
      throw new Error(`Unknown e-mail job: ${job.name}`);
    }

    const { to, ...data } = job.data;
    await mailer.send({ to, ...buildNewReplyEmail(data) });
  };
}
