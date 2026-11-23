import { z } from 'zod';
import { positiveIntFromString } from './common.schema.ts';

const titleSchema = z.string().trim().min(1).max(200);
const contentSchema = z.string().trim().min(1);

export const postIdParamsSchema = z.object({
  id: positiveIntFromString('Id must be a positive integer'),
});

export const listPostsQuerySchema = z.object({
  page: positiveIntFromString('Page must be a positive integer').default(1),
});

export const createPostSchema = z.object({
  title: titleSchema,
  content: contentSchema,
});

export const updatePostSchema = z
  .strictObject({
    title: titleSchema.optional(),
    content: contentSchema.optional(),
  })
  .refine((data) => data.title !== undefined || data.content !== undefined, {
    message: 'At least one of title or content must be provided',
  });

export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;
export type PostIdParams = z.infer<typeof postIdParamsSchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
