import type { RequestHandler } from 'express';
import { toReplyOutputDTO } from '../dtos/reply-output.dto.ts';
import { getAuthenticatedUser } from '../middlewares/ensure-authenticated.ts';
import { emailsQueue } from '../queues/emails/queue.ts';
import { BullMqEmailJobRepository } from '../repositories/bullmq-email-job.repository.ts';
import { DrizzlePostRepository } from '../repositories/drizzle-post.repository.ts';
import type { EmailJobRepository } from '../repositories/email-job.repository.ts';
import { DrizzleReplyRepository } from '../repositories/drizzle-reply.repository.ts';
import type { PostRepository } from '../repositories/post.repository.ts';
import type {
  ReplyRepository,
  ReplyWithAuthorRecord,
} from '../repositories/reply.repository.ts';
import {
  createReplyBodySchema,
  createReplyParamsSchema,
  deleteReplyParamsSchema,
} from '../schemas/reply.schema.ts';
import {
  CreateReplyUseCase,
  type CreateReplyInput,
} from '../use-cases/replies/create-reply.use-case.ts';
import {
  DeleteReplyUseCase,
  type DeleteReplyInput,
} from '../use-cases/replies/delete-reply.use-case.ts';
import type { UseCase } from '../use-cases/use-case.ts';

// Composição: as implementações concretas são ligadas uma única vez, fora dos handlers.
const replyRepository: ReplyRepository = new DrizzleReplyRepository();
const postRepository: PostRepository = new DrizzlePostRepository();
// O e-mail de nova reply vai para a fila; quem envia é o worker (`src/queues/emails/worker.ts`).
const emailJobRepository: EmailJobRepository = new BullMqEmailJobRepository(emailsQueue);

const createReply: UseCase<CreateReplyInput, ReplyWithAuthorRecord> = new CreateReplyUseCase(
  replyRepository,
  postRepository,
  emailJobRepository,
);
const deleteReply: UseCase<DeleteReplyInput, void> = new DeleteReplyUseCase(replyRepository);

export const createReplyController: RequestHandler = async (req, res) => {
  const user = getAuthenticatedUser(req);
  const { id } = createReplyParamsSchema.parse(req.params);
  const data = createReplyBodySchema.parse(req.body);
  const reply = await createReply.execute({ postId: id, data, author: user });
  res.status(201).json(toReplyOutputDTO(reply));
};

export const deleteReplyController: RequestHandler = async (req, res) => {
  const user = getAuthenticatedUser(req);
  const { id, replyId } = deleteReplyParamsSchema.parse(req.params);
  await deleteReply.execute({ postId: id, replyId, userId: user.id });
  res.status(204).end();
};
