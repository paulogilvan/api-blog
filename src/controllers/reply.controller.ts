import type { RequestHandler } from 'express';
import { toReplyOutputDTO } from '../dtos/reply-output.dto.ts';
import { env } from '../env.ts';
import { getAuthenticatedUser } from '../middlewares/ensure-authenticated.ts';
import { DrizzlePostRepository } from '../repositories/drizzle-post.repository.ts';
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
import type { Mailer } from '../utils/mailer.ts';
import { NodemailerMailer } from '../utils/nodemailer-mailer.ts';

// Composição: as implementações concretas são ligadas uma única vez, fora dos handlers.
const replyRepository: ReplyRepository = new DrizzleReplyRepository();
const postRepository: PostRepository = new DrizzlePostRepository();
// Um único transporter SMTP para a aplicação inteira.
const mailer: Mailer = new NodemailerMailer({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  from: env.SMTP_FROM,
  user: env.SMTP_USER,
  pass: env.SMTP_PASS,
});

const createReply: UseCase<CreateReplyInput, ReplyWithAuthorRecord> = new CreateReplyUseCase(
  replyRepository,
  postRepository,
  mailer,
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
