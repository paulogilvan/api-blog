import { Router } from 'express';
import { loginController, registerController } from '../controllers/auth.controller.ts';

export const authRoutes = Router();

authRoutes.post('/register', registerController);
authRoutes.post('/login', loginController);
