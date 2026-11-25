import { Worker } from 'bullmq';
import { env } from '../../env.ts';
import { errorCode } from '../../errors/error-code.ts';
import type { NewReplyEmailJob } from '../../repositories/email-job.repository.ts';
import type { Mailer } from '../../utils/mailer.ts';
import { NodemailerMailer } from '../../utils/nodemailer-mailer.ts';
import { redisConnection } from '../connection.ts';
import { EMAILS_QUEUE_NAME } from './names.ts';
import { createEmailProcessor } from './processor.ts';

// Composição do worker: um único transporter SMTP para todos os jobs.
const mailer: Mailer = new NodemailerMailer({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  from: env.SMTP_FROM,
  user: env.SMTP_USER,
  pass: env.SMTP_PASS,
});

export function startEmailWorker() {
  const worker = new Worker<NewReplyEmailJob>(EMAILS_QUEUE_NAME, createEmailProcessor(mailer), {
    connection: redisConnection,
    prefix: env.QUEUE_PREFIX,
    concurrency: 5,
  });

  // Só id, nome, tentativa e código do erro: o job carrega o destinatário e o texto da reply,
  // e mensagens de SMTP costumam citar o endereço.
  worker.on('failed', (job, error) => {
    console.error('E-mail job failed:', {
      jobId: job?.id,
      name: job?.name,
      attemptsMade: job?.attemptsMade,
      error: errorCode(error),
    });
  });

  // Sem listener, um evento `error` (ex.: Redis caiu) derrubaria o processo.
  worker.on('error', (error) => {
    console.error('E-mail worker error:', { error: errorCode(error) });
  });

  return worker;
}
