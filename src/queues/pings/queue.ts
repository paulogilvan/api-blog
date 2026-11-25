import { Queue } from 'bullmq';
import { env } from '../../env.ts';
import { redisConnection } from '../connection.ts';
import { PINGS_QUEUE_NAME } from './names.ts';

// Fila de exemplo do BullMQ (sem uso pela API): serve para testar Redis, worker e Bull Board.
export const pingsQueue = new Queue(PINGS_QUEUE_NAME, {
  connection: redisConnection,
  prefix: env.QUEUE_PREFIX,
  defaultJobOptions: {
    removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
    removeOnFail: { age: 7 * 24 * 60 * 60 },
  },
});
