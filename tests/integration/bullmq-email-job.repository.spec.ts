import { beforeEach, describe, expect, it } from 'vitest';
import { NEW_REPLY_EMAIL_JOB } from '../../src/queues/emails/names.ts';
import { emailsQueue } from '../../src/queues/emails/queue.ts';
import { BullMqEmailJobRepository } from '../../src/repositories/bullmq-email-job.repository.ts';
import type { NewReplyEmailJob } from '../../src/repositories/email-job.repository.ts';
import { clearEmailQueue } from '../helpers/queue.ts';

const job: NewReplyEmailJob = {
  to: 'john@example.com',
  recipientName: 'John Doe',
  replierName: 'Jane Roe',
  postTitle: 'My post',
  replyContent: 'Great post!',
};

// Contra o Redis real (prefixo de teste) e sem worker rodando: o job fica esperando na fila.
describe('BullMqEmailJobRepository', () => {
  beforeEach(async () => {
    await clearEmailQueue();
  });

  it('adds a new reply job with the full payload to the e-mail queue', async () => {
    const repository = new BullMqEmailJobRepository(emailsQueue);

    await repository.createNewReplyEmailJob(job);

    const jobs = await emailsQueue.getJobs(['waiting']);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].name).toBe(NEW_REPLY_EMAIL_JOB);
    expect(jobs[0].data).toEqual(job);
    expect(jobs[0].opts.attempts).toBe(3);
  });

  it('rejects with ETIMEDOUT when the queue does not answer in time', async () => {
    // Simula o Redis fora do ar: com `maxRetriesPerRequest: null` o `add` nunca resolveria.
    const hangingQueue = { add: () => new Promise<never>(() => {}) };
    const repository = new BullMqEmailJobRepository(hangingQueue, 50);

    await expect(repository.createNewReplyEmailJob(job)).rejects.toMatchObject({
      code: 'ETIMEDOUT',
    });
  });
});
