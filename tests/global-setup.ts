import { existsSync } from 'node:fs';
import { Queue } from 'bullmq';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { loadEnv } from 'vite';
import { EMAILS_QUEUE_NAME } from '../src/queues/emails/names.ts';
import { clearMailbox } from './helpers/mailpit.ts';

// Antes da suíte: limpa a caixa do Mailpit de teste e a fila de e-mails de teste, e aplica as
// migrations no banco de teste.
// Obs.: o globalSetup roda no processo principal do Vitest, onde `test.env`
// não é aplicado — por isso o .env.test é carregado explicitamente aqui.
export default async function setup() {
  const { DATABASE_URL, MAILPIT_API_URL, REDIS_URL, QUEUE_PREFIX } = loadEnv(
    'test',
    process.cwd(),
    '',
  );

  // Uma limpeza por execução (não por teste): os e-mails desta execução ficam
  // visíveis na UI do Mailpit de teste (http://localhost:8026) quando ela termina.
  if (!MAILPIT_API_URL) throw new Error('MAILPIT_API_URL is not defined in .env.test');
  await clearMailbox(MAILPIT_API_URL);

  // Jobs de e-mail que sobraram de uma execução anterior (ex.: interrompida) não podem ser
  // entregues no meio desta. Só o prefixo de teste é limpo; as filas de dev ficam intactas.
  if (!REDIS_URL || !QUEUE_PREFIX) {
    throw new Error('REDIS_URL and QUEUE_PREFIX must be defined in .env.test');
  }
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  const emailsQueue = new Queue(EMAILS_QUEUE_NAME, { connection: redis, prefix: QUEUE_PREFIX });
  try {
    await emailsQueue.obliterate({ force: true });
  } finally {
    await emailsQueue.close();
    await redis.quit();
  }

  const migrationsFolder = './drizzle';
  if (!existsSync(`${migrationsFolder}/meta/_journal.json`)) return;

  if (!DATABASE_URL) throw new Error('DATABASE_URL is not defined in .env.test');

  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}
