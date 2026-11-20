import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import { pool } from '../../src/db/index.ts';

const app = createApp();

describe('GET /api/health', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('returns 200 with status ok and database up', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', database: 'up' });
    expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
  });

  it('returns 404 with error envelope for unknown routes', async () => {
    const response = await request(app).get('/api/unknown-route');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
