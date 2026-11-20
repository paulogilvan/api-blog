import { Router } from 'express';
import { createPostController } from '../controllers/post.controller.ts';
import { ensureAuthenticated } from '../middlewares/ensure-authenticated.ts';

export const postRoutes = Router();

postRoutes.post('/', ensureAuthenticated, createPostController);
