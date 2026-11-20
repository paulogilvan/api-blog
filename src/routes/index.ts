import { Router } from 'express';
import { healthController } from '../controllers/health.controller.ts';
import { authRoutes } from './auth.routes.ts';
import { postRoutes } from './post.routes.ts';

export const routes = Router();

routes.get('/health', healthController);
routes.use('/auth', authRoutes);
routes.use('/posts', postRoutes);
