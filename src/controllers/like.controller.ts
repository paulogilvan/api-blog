import type { RequestHandler } from 'express';
import { toLikesOutputDTO } from '../dtos/like-output.dto.ts';
import { getAuthenticatedUser } from '../middlewares/ensure-authenticated.ts';
import { DrizzleLikeRepository } from '../repositories/drizzle-like.repository.ts';
import type { LikeRepository } from '../repositories/like.repository.ts';
import { likeParamsSchema } from '../schemas/like.schema.ts';
import { LikePostUseCase, type LikePostInput } from '../use-cases/likes/like-post.use-case.ts';
import type { LikesCountRecord } from '../use-cases/likes/likes-count.ts';
import {
  UnlikePostUseCase,
  type UnlikePostInput,
} from '../use-cases/likes/unlike-post.use-case.ts';
import type { UseCase } from '../use-cases/use-case.ts';

// Composição: as implementações concretas são ligadas uma única vez, fora dos handlers.
const likeRepository: LikeRepository = new DrizzleLikeRepository();

const likePost: UseCase<LikePostInput, LikesCountRecord> = new LikePostUseCase(likeRepository);
const unlikePost: UseCase<UnlikePostInput, LikesCountRecord> = new UnlikePostUseCase(
  likeRepository,
);

export const likePostController: RequestHandler = async (req, res) => {
  const user = getAuthenticatedUser(req);
  const { id } = likeParamsSchema.parse(req.params);
  const result = await likePost.execute({ postId: id, userId: user.id });
  res.status(200).json(toLikesOutputDTO(result));
};

export const unlikePostController: RequestHandler = async (req, res) => {
  const user = getAuthenticatedUser(req);
  const { id } = likeParamsSchema.parse(req.params);
  const result = await unlikePost.execute({ postId: id, userId: user.id });
  res.status(200).json(toLikesOutputDTO(result));
};
