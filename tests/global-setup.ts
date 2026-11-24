import { existsSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { loadEnv } from 'vite';
import { clearMailbox } from './helpers/mailpit.ts';

// Antes da suíte: limpa a caixa do Mailpit de teste e aplica as migrations no banco de teste.
// Obs.: o globalSetup roda no processo principal do Vitest, onde `test.env`
// não é aplicado — por isso o .env.test é carregado explicitamente aqui.
export default async function setup() {
  const { DATABASE_URL, MAILPIT_API_URL } = loadEnv('test', process.cwd(), '');

  // Uma limpeza por execução (não por teste): os e-mails desta execução ficam
  // visíveis na UI do Mailpit de teste (http://localhost:8026) quando ela termina.
  if (!MAILPIT_API_URL) throw new Error('MAILPIT_API_URL is not defined in .env.test');
  await clearMailbox(MAILPIT_API_URL);

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
