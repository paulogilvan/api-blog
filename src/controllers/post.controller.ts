import type { RequestHandler } from 'express';
import { getAuthenticatedUser } from '../middlewares/ensure-authenticated.ts';
import { createPostSchema } from '../schemas/post.schema.ts';
import * as postService from '../services/post.service.ts';

export const createPostController: RequestHandler = async (req, res) => {
  const user = getAuthenticatedUser(req);
  const input = createPostSchema.parse(req.body);
  const result = await postService.createPost(input, user);
  res.status(201).json(result);
};
