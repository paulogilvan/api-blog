import type { RequestHandler } from 'express';
import {
  toPostDetailOutputDTO,
  toPostListOutputDTO,
  toPostOutputDTO,
} from '../dtos/post-output.dto.ts';
import { getAuthenticatedUser, getOptionalUser } from '../middlewares/ensure-authenticated.ts';
import { DrizzleLikeRepository } from '../repositories/drizzle-like.repository.ts';
import { DrizzlePostRepository } from '../repositories/drizzle-post.repository.ts';
import { DrizzleReplyRepository } from '../repositories/drizzle-reply.repository.ts';
import type { LikeRepository } from '../repositories/like.repository.ts';
import type { ReplyRepository } from '../repositories/reply.repository.ts';
import type { PostRepository, PostWithAuthorRecord } from '../repositories/post.repository.ts';
import {
  createPostSchema,
  listPostsQuerySchema,
  postIdParamsSchema,
  updatePostSchema,
} from '../schemas/post.schema.ts';
import {
  CreatePostUseCase,
  type CreatePostUseCaseInput,
} from '../use-cases/posts/create-post.use-case.ts';
import { DeletePostUseCase, type DeletePostInput } from '../use-cases/posts/delete-post.use-case.ts';
import {
  GetPostUseCase,
  type GetPostInput,
  type PostDetailRecord,
} from '../use-cases/posts/get-post.use-case.ts';
import {
  ListPostsUseCase,
  type ListPostsInput,
  type ListPostsOutput,
} from '../use-cases/posts/list-posts.use-case.ts';
import {
  UpdatePostUseCase,
  type UpdatePostUseCaseInput,
} from '../use-cases/posts/update-post.use-case.ts';
import type { UseCase } from '../use-cases/use-case.ts';

// Composição: as implementações concretas são ligadas uma única vez, fora dos handlers.
// Os handlers só conhecem a abstração `UseCase`.
const postRepository: PostRepository = new DrizzlePostRepository();
const likeRepository: LikeRepository = new DrizzleLikeRepository();
const replyRepository: ReplyRepository = new DrizzleReplyRepository();

const listPosts: UseCase<ListPostsInput, ListPostsOutput> = new ListPostsUseCase(postRepository);
const getPost: UseCase<GetPostInput, PostDetailRecord> = new GetPostUseCase(
  postRepository,
  likeRepository,
  replyRepository,
);
const createPost: UseCase<CreatePostUseCaseInput, PostWithAuthorRecord> = new CreatePostUseCase(
  postRepository,
);
const updatePost: UseCase<UpdatePostUseCaseInput, PostWithAuthorRecord> = new UpdatePostUseCase(
  postRepository,
);
const deletePost: UseCase<DeletePostInput, void> = new DeletePostUseCase(postRepository);

export const listPostsController: RequestHandler = async (req, res) => {
  const { page } = listPostsQuerySchema.parse(req.query);
  const result = await listPosts.execute({ page });
  res.status(200).json(toPostListOutputDTO(result, page));
};

export const getPostController: RequestHandler = async (req, res) => {
  const { id } = postIdParamsSchema.parse(req.params);
  const viewer = getOptionalUser(req);
  const post = await getPost.execute({ postId: id, viewerId: viewer?.id ?? null });
  res.status(200).json(toPostDetailOutputDTO(post));
};

export const createPostController: RequestHandler = async (req, res) => {
  const user = getAuthenticatedUser(req);
  const data = createPostSchema.parse(req.body);
  const post = await createPost.execute({ data, author: user });
  res.status(201).json(toPostOutputDTO(post));
};

export const updatePostController: RequestHandler = async (req, res) => {
  const user = getAuthenticatedUser(req);
  const { id } = postIdParamsSchema.parse(req.params);
  const data = updatePostSchema.parse(req.body);
  const post = await updatePost.execute({ postId: id, data, user });
  res.status(200).json(toPostOutputDTO(post));
};

export const deletePostController: RequestHandler = async (req, res) => {
  const user = getAuthenticatedUser(req);
  const { id } = postIdParamsSchema.parse(req.params);
  await deletePost.execute({ postId: id, userId: user.id });
  res.status(204).end();
};
