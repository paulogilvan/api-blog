import { existsSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { loadEnv } from 'vite';

// Aplica as migrations no banco de teste antes da suíte rodar.
// Obs.: o globalSetup roda no processo principal do Vitest, onde `test.env`
// não é aplicado — por isso o .env.test é carregado explicitamente aqui.
export default async function setup() {
  const migrationsFolder = './drizzle';
  if (!existsSync(`${migrationsFolder}/meta/_journal.json`)) return;

  const { DATABASE_URL } = loadEnv('test', process.cwd(), '');
  if (!DATABASE_URL) throw new Error('DATABASE_URL is not defined in .env.test');

  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}
