import type { Express } from 'express';
import request from 'supertest';

export const defaultUser = { name: 'John Doe', email: 'john@example.com', password: 'secret123' };

export type RegisteredUser = { token: string; user: { id: number; name: string; email: string } };

export async function registerUser(app: Express, overrides: Partial<typeof defaultUser> = {}) {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ ...defaultUser, ...overrides });
  return response.body as RegisteredUser;
}

export type CreatedPost = {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  author: { id: number; name: string };
};

export async function createPost(
  app: Express,
  token: string,
  body = { title: 'Original title', content: 'Original content' },
) {
  const response = await request(app)
    .post('/api/posts')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  return response.body as CreatedPost;
}
