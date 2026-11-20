import { z } from 'zod';

// Maior valor da coluna `integer` do Postgres: ids acima disso nem chegam ao banco.
const PG_INT_MAX = 2_147_483_647;

const titleSchema = z.string().trim().min(1).max(200);
const contentSchema = z.string().trim().min(1);

// Só dígitos decimais sem zero à esquerda: `Number()` (usado por z.coerce) aceitaria
// "0x10", "1e1", " 1 " e "1.0", fazendo o mesmo post responder por várias URLs.
export const postIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/, 'Id must be a positive integer')
    .transform(Number)
    .pipe(z.number().int().positive().max(PG_INT_MAX)),
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

export type PostIdParams = z.infer<typeof postIdParamsSchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
