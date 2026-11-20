import type { RequestHandler } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.ts';

export const healthController: RequestHandler = async (_req, res) => {
  let database: 'up' | 'down' = 'up';

  try {
    await db.execute(sql`select 1`);
  } catch {
    database = 'down';
  }

  const ok = database === 'up';

  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'error',
    database,
    timestamp: new Date().toISOString(),
  });
};
