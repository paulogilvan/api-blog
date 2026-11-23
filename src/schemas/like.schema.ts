import { z } from 'zod';
import { positiveIntFromString } from './common.schema.ts';

// POST/DELETE /posts/:id/likes não têm body: só o id do post vem da URL.
export const likeParamsSchema = z.object({
  id: positiveIntFromString('Id must be a positive integer'),
});

export type LikeParams = z.infer<typeof likeParamsSchema>;
