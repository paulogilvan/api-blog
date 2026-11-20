import { Router } from 'express';
import {
  createPostController,
  deletePostController,
  getPostController,
  listPostsController,
  updatePostController,
} from '../controllers/post.controller.ts';
import { ensureAuthenticated } from '../middlewares/ensure-authenticated.ts';

export const postRoutes = Router();

// Públicas
postRoutes.get('/', listPostsController);
postRoutes.get('/:id', getPostController);

// Protegidas
postRoutes.post('/', ensureAuthenticated, createPostController);
postRoutes.put('/:id', ensureAuthenticated, updatePostController);
postRoutes.delete('/:id', ensureAuthenticated, deletePostController);
