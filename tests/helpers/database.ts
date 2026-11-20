import { sql } from 'drizzle-orm';
import { db } from '../../src/db/index.ts';

// Limpa as tabelas entre os testes (banco de teste real, sem mocks).
export async function resetDatabase() {
  await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`);
}
