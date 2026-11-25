import { Redis } from 'ioredis';

const url = process.env.REDIS_URL;
if (!url) throw new Error('REDIS_URL is not defined');

// Conexão compartilhada por filas e workers. `maxRetriesPerRequest: null` é exigido pelo Worker
// do BullMQ (comandos bloqueantes não podem falhar após N tentativas).
export const redisConnection = new Redis(url, {
  maxRetriesPerRequest: null,
});
