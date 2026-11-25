import { createApp } from './app.ts';
import { pool } from './db/index.ts';
import { env } from './env.ts';
import { startPingWorker } from './queues/pings/worker.ts';

const app = createApp();

startPingWorker()

const server = app.listen(env.PORT, () => {
  console.log(`API running on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
