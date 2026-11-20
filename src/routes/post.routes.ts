import { Router } from 'express';
import {
  createPostController,
  deletePostController,
  updatePostController,
} from '../controllers/post.controller.ts';
import { ensureAuthenticated } from '../middlewares/ensure-authenticated.ts';

export const postRoutes = Router();

postRoutes.post('/', ensureAuthenticated, createPostController);
postRoutes.put('/:id', ensureAuthenticated, updatePostController);
postRoutes.delete('/:id', ensureAuthenticated, deletePostController);
