import { emailsQueue } from '../../src/queues/emails/queue.ts';

/** Remove todos os jobs da fila de e-mails de teste (prefixo `QUEUE_PREFIX` do `.env.test`). */
export async function clearEmailQueue() {
  await emailsQueue.obliterate({ force: true });
}

/** Total de jobs na fila de e-mails, em qualquer estado (inclusive concluídos e falhos). */
export async function emailQueueJobCount() {
  return emailsQueue.getJobCountByTypes(
    'waiting',
    'active',
    'delayed',
    'prioritized',
    'completed',
    'failed',
  );
}

/**
 * Espera a fila de e-mails ficar sem jobs pendentes ou em andamento. Usado no `beforeEach`, para
 * um e-mail de um teste não chegar depois da marca do Mailpit do teste seguinte.
 */
export async function waitForEmailQueueIdle({ timeoutMs = 5000, intervalMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const counts = await emailsQueue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'prioritized',
    );
    if (Object.values(counts).every((count) => count === 0)) return;
    if (Date.now() >= deadline) {
      throw new Error(`E-mail queue not idle within ${timeoutMs}ms: ${JSON.stringify(counts)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
