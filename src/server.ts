import { createApp } from './app.ts';
import { pool } from './db/index.ts';
import { env } from './env.ts';
import { emailsQueue } from './queues/emails/queue.ts';
import { startEmailWorker } from './queues/emails/worker.ts';
import { startPingWorker } from './queues/pings/worker.ts';

const app = createApp();

startPingWorker()
// O worker de e-mail roda no mesmo processo da API.
const emailWorker = startEmailWorker();

const server = app.listen(env.PORT, () => {
  console.log(`API running on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    // `close` espera os jobs em andamento terminarem antes de soltar o worker.
    await emailWorker.close();
    await emailsQueue.close();
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
