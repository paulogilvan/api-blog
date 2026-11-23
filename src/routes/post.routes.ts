import { Router } from 'express';
import { likePostController, unlikePostController } from '../controllers/like.controller.ts';
import {
  createPostController,
  deletePostController,
  getPostController,
  listPostsController,
  updatePostController,
} from '../controllers/post.controller.ts';
import {
  ensureAuthenticated,
  optionalAuthentication,
} from '../middlewares/ensure-authenticated.ts';

export const postRoutes = Router();

// Públicas
postRoutes.get('/', listPostsController);
// Pública com autenticação opcional: o token, se enviado, define `likedByMe`.
postRoutes.get('/:id', optionalAuthentication, getPostController);

// Protegidas
postRoutes.post('/', ensureAuthenticated, createPostController);
postRoutes.put('/:id', ensureAuthenticated, updatePostController);
postRoutes.delete('/:id', ensureAuthenticated, deletePostController);
postRoutes.post('/:id/likes', ensureAuthenticated, likePostController);
postRoutes.delete('/:id/likes', ensureAuthenticated, unlikePostController);
