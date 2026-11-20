import type { RequestHandler } from 'express';
import { getAuthenticatedUser } from '../middlewares/ensure-authenticated.ts';
import {
  createPostSchema,
  postIdParamsSchema,
  updatePostSchema,
} from '../schemas/post.schema.ts';
import * as postService from '../services/post.service.ts';

export const createPostController: RequestHandler = async (req, res) => {
  const user = getAuthenticatedUser(req);
  const input = createPostSchema.parse(req.body);
  const result = await postService.createPost(input, user);
  res.status(201).json(result);
};

export const updatePostController: RequestHandler = async (req, res) => {
  const user = getAuthenticatedUser(req);
  const { id } = postIdParamsSchema.parse(req.params);
  const input = updatePostSchema.parse(req.body);
  const result = await postService.updatePost(id, input, user);
  res.status(200).json(result);
};

export const deletePostController: RequestHandler = async (req, res) => {
  const user = getAuthenticatedUser(req);
  const { id } = postIdParamsSchema.parse(req.params);
  await postService.deletePost(id, user.id);
  res.status(204).end();
};
