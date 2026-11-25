import type { Queue } from 'bullmq';
import { NEW_REPLY_EMAIL_JOB } from '../queues/emails/names.ts';
import type { EmailJobRepository, NewReplyEmailJob } from './email-job.repository.ts';

/** Prazo para gravar o job: o enfileiramento acontece dentro da requisição. */
const DEFAULT_ENQUEUE_TIMEOUT_MS = 2_000;

/**
 * Adapter BullMQ. Junto com `src/queues/`, é o único lugar que conhece o BullMQ.
 */
export class BullMqEmailJobRepository implements EmailJobRepository {
  private readonly queue: Pick<Queue<NewReplyEmailJob>, 'add'>;
  private readonly timeoutMs: number;

  constructor(queue: Pick<Queue<NewReplyEmailJob>, 'add'>, timeoutMs = DEFAULT_ENQUEUE_TIMEOUT_MS) {
    this.queue = queue;
    this.timeoutMs = timeoutMs;
  }

  async createNewReplyEmailJob(job: NewReplyEmailJob) {
    // A conexão do Redis usa `maxRetriesPerRequest: null` (exigido pelo Worker): com o Redis fora
    // do ar, o `add` ficaria esperando a reconexão para sempre e seguraria a resposta.
    await withTimeout(this.queue.add(NEW_REPLY_EMAIL_JOB, job), this.timeoutMs);
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(Object.assign(new Error(`Enqueue timed out after ${ms}ms`), { code: 'ETIMEDOUT' }));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
