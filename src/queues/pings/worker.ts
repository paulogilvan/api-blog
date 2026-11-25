import { Worker } from 'bullmq';
import { env } from '../../env.ts';
import { errorCode } from '../../errors/error-code.ts';
import { redisConnection } from '../connection.ts';
import { PINGS_QUEUE_NAME } from './names.ts';
import { processPing } from './processor.ts';

export function startPingWorker() {
  const worker = new Worker(PINGS_QUEUE_NAME, processPing, {
    connection: redisConnection,
    prefix: env.QUEUE_PREFIX,
  });

  worker.on('failed', (job, error) => {
    console.error('Ping job failed:', { jobId: job?.id, error: errorCode(error) });
  });

  // Sem listener, um evento `error` (ex.: Redis caiu) derrubaria o processo.
  worker.on('error', (error) => {
    console.error('Ping worker error:', { error: errorCode(error) });
  });

  return worker;
}
