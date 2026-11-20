import { z } from 'zod';

// E-mail normalizado (trim + lowercase); limite igual ao da coluna varchar(255).
const emailSchema = z.string().trim().toLowerCase().max(255).pipe(z.email());

// bcrypt considera apenas os primeiros 72 bytes (UTF-8); o resto seria ignorado em silêncio.
const BCRYPT_MAX_BYTES = 72;

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  password: z
    .string()
    .min(6)
    .refine((value) => Buffer.byteLength(value, 'utf8') <= BCRYPT_MAX_BYTES, {
      message: `Password must be at most ${BCRYPT_MAX_BYTES} bytes`,
    }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(6),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
