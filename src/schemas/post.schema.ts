import { z } from 'zod';

export const createPostSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
