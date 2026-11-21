import type { RequestHandler } from 'express';
import { DrizzleUserRepository } from '../repositories/drizzle-user.repository.ts';
import { loginSchema, registerSchema } from '../schemas/auth.schema.ts';
import { AuthService, type AuthSession } from '../services/auth.service.ts';

const authService = new AuthService(new DrizzleUserRepository());

type AuthResponse = {
  token: string;
  user: { id: number; name: string; email: string };
};

// Único ponto que define o JSON de auth: escolhe os campos explicitamente,
// então dados internos do usuário (ex.: passwordHash) nunca vão para a resposta.
function toAuthResponse(session: AuthSession): AuthResponse {
  return {
    token: session.token,
    user: { id: session.user.id, name: session.user.name, email: session.user.email },
  };
}

export const registerController: RequestHandler = async (req, res) => {
  const input = registerSchema.parse(req.body);
  const session = await authService.register(input);
  res.status(201).json(toAuthResponse(session));
};

export const loginController: RequestHandler = async (req, res) => {
  const input = loginSchema.parse(req.body);
  const session = await authService.login(input);
  res.status(200).json(toAuthResponse(session));
};
