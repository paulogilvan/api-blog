import { Router } from 'express';
import { healthController } from '../controllers/health.controller.ts';

export const routes = Router();

routes.get('/health', healthController);
