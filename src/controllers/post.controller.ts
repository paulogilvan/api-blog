import type { RequestHandler } from 'express';
import { getAuthenticatedUser } from '../middlewares/ensure-authenticated.ts';
import { DrizzlePostRepository } from '../repositories/drizzle-post.repository.ts';
import type { PostWithAuthorRecord } from '../repositories/post.repository.ts';
import {
  createPostSchema,
  listPostsQuerySchema,
  postIdParamsSchema,
  updatePostSchema,
} from '../schemas/post.schema.ts';
import { PostService } from '../services/post.service.ts';

const postService = new PostService(new DrizzlePostRepository());

type PostResponse = {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  author: { id: number; name: string };
};

function toPostResponse(post: PostWithAuthorRecord): PostResponse {
  return {
    id: post.id,
    title: post.title,
    content: post.content,
    createdAt: post.createdAt.toISOString(),
    author: { id: post.author.id, name: post.author.name },
  };
}

export const listPostsController: RequestHandler = async (req, res) => {
  const { page } = listPostsQuerySchema.parse(req.query);
  const { posts, total, limit } = await postService.listPosts(page);
  res.status(200).json({
    data: posts.map(toPostResponse),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
};

export const getPostController: RequestHandler = async (req, res) => {
  const { id } = postIdParamsSchema.parse(req.params);
  const post = await postService.getPostById(id);
  res.status(200).json(toPostResponse(post));
};

export const createPostController: RequestHandler = async (req, res) => {
  const user = getAuthenticatedUser(req);
  const input = createPostSchema.parse(req.body);
  const post = await postService.createPost(input, user);
  res.status(201).json(toPostResponse(post));
};

export const updatePostController: RequestHandler = async (req, res) => {
  const user = getAuthenticatedUser(req);
  const { id } = postIdParamsSchema.parse(req.params);
  const input = updatePostSchema.parse(req.body);
  const post = await postService.updatePost(id, input, user);
  res.status(200).json(toPostResponse(post));
};

export const deletePostController: RequestHandler = async (req, res) => {
  const user = getAuthenticatedUser(req);
  const { id } = postIdParamsSchema.parse(req.params);
  await postService.deletePost(id, user.id);
  res.status(204).end();
};
