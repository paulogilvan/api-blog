import { afterAll } from 'vitest';
import { redisConnection } from '../src/queues/connection.ts';
import { emailsQueue } from '../src/queues/emails/queue.ts';

// Cada arquivo de teste carrega os módulos do zero: sem isto, toda spec que importa a app
// (controller → fila) deixaria uma conexão do Redis aberta. Roda depois dos `afterAll` da spec.
afterAll(async () => {
  await emailsQueue.close();
  await redisConnection.quit();
});
