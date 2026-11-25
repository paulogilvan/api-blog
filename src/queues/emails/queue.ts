import { Queue } from 'bullmq';
import { env } from '../../env.ts';
import type { NewReplyEmailJob } from '../../repositories/email-job.repository.ts';
import { redisConnection } from '../connection.ts';
import { EMAILS_QUEUE_NAME } from './names.ts';

export const emailsQueue = new Queue<NewReplyEmailJob>(EMAILS_QUEUE_NAME, {
  connection: redisConnection,
  // Nos testes o prefixo é outro, para não misturar com as filas de dev no mesmo Redis.
  prefix: env.QUEUE_PREFIX,
  defaultJobOptions: {
    // SMTP fora do ar costuma ser passageiro: 3 tentativas com espera de 5 s, 10 s.
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    // Os jobs carregam e-mail e texto de usuários: não guardar para sempre no Redis.
    removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
    removeOnFail: { age: 7 * 24 * 60 * 60 },
  },
});
