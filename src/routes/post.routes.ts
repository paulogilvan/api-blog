import { Router } from 'express';
import { likePostController, unlikePostController } from '../controllers/like.controller.ts';
import { createReplyController, deleteReplyController } from '../controllers/reply.controller.ts';
import {
  createPostController,
  deletePostController,
  getPostController,
  listPostsController,
  updatePostController,
  updatePostImageController,
} from '../controllers/post.controller.ts';
import {
  ensureAuthenticated,
  optionalAuthentication,
} from '../middlewares/ensure-authenticated.ts';
import { singleImage } from '../middlewares/upload.ts';

export const postRoutes = Router();

// Públicas
postRoutes.get('/', listPostsController);
// Pública com autenticação opcional: o token, se enviado, define `likedByMe`.
postRoutes.get('/:id', optionalAuthentication, getPostController);

// Protegidas
postRoutes.post('/', ensureAuthenticated, createPostController);
postRoutes.put('/:id', ensureAuthenticated, updatePostController);
postRoutes.delete('/:id', ensureAuthenticated, deletePostController);
// Autenticação antes do upload: requisição sem token é rejeitada sem ler o arquivo.
postRoutes.put('/:id/image', ensureAuthenticated, singleImage(), updatePostImageController);
postRoutes.post('/:id/likes', ensureAuthenticated, likePostController);
postRoutes.delete('/:id/likes', ensureAuthenticated, unlikePostController);
postRoutes.post('/:id/replies', ensureAuthenticated, createReplyController);
postRoutes.delete('/:id/replies/:replyId', ensureAuthenticated, deleteReplyController);
