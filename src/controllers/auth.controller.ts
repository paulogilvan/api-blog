import type { RequestHandler } from 'express';
import { loginSchema, registerSchema } from '../schemas/auth.schema.ts';
import * as authService from '../services/auth.service.ts';

export const registerController: RequestHandler = async (req, res) => {
  const input = registerSchema.parse(req.body);
  const result = await authService.register(input);
  res.status(201).json(result);
};

export const loginController: RequestHandler = async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input);
  res.status(200).json(result);
};
