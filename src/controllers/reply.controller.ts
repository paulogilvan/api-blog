import type { RequestHandler } from 'express';
import { toReplyOutputDTO } from '../dtos/reply-output.dto.ts';
import { getAuthenticatedUser } from '../middlewares/ensure-authenticated.ts';
import { DrizzleReplyRepository } from '../repositories/drizzle-reply.repository.ts';
import type {
  ReplyRepository,
  ReplyWithAuthorRecord,
} from '../repositories/reply.repository.ts';
import { createReplyBodySchema, createReplyParamsSchema } from '../schemas/reply.schema.ts';
import {
  CreateReplyUseCase,
  type CreateReplyInput,
} from '../use-cases/replies/create-reply.use-case.ts';
import type { UseCase } from '../use-cases/use-case.ts';

// Composição: as implementações concretas são ligadas uma única vez, fora dos handlers.
const replyRepository: ReplyRepository = new DrizzleReplyRepository();

const createReply: UseCase<CreateReplyInput, ReplyWithAuthorRecord> = new CreateReplyUseCase(
  replyRepository,
);

export const createReplyController: RequestHandler = async (req, res) => {
  const user = getAuthenticatedUser(req);
  const { id } = createReplyParamsSchema.parse(req.params);
  const data = createReplyBodySchema.parse(req.body);
  const reply = await createReply.execute({ postId: id, data, author: user });
  res.status(201).json(toReplyOutputDTO(reply));
};
