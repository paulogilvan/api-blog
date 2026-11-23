import { z } from 'zod';
import { positiveIntFromString } from './common.schema.ts';

// Mesmo limite da coluna `replies.content` varchar(1000).
export const REPLY_CONTENT_MAX_LENGTH = 1000;

// POST /posts/:id/replies
export const createReplyParamsSchema = z.object({
  id: positiveIntFromString('Id must be a positive integer'),
});

// strictObject: campos extras (ex.: `postId`, `authorId`) viram 400 em vez de serem ignorados.
export const createReplyBodySchema = z.strictObject({
  content: z.string().trim().min(1).max(REPLY_CONTENT_MAX_LENGTH),
});

// DELETE /posts/:id/replies/:replyId
export const deleteReplyParamsSchema = z.object({
  id: positiveIntFromString('Id must be a positive integer'),
  replyId: positiveIntFromString('Reply id must be a positive integer'),
});

export type CreateReplyParams = z.infer<typeof createReplyParamsSchema>;
export type CreateReplyBody = z.infer<typeof createReplyBodySchema>;
export type DeleteReplyParams = z.infer<typeof deleteReplyParamsSchema>;
