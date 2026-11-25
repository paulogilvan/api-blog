import type { Job } from 'bullmq';

export async function processPing(job: Pick<Job, 'id' | 'data'>) {
  console.log('pong', job.id, job.data);
}
