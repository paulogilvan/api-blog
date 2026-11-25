import { z } from 'zod';

// Variável vazia no .env (ex.: `SMTP_USER=`) conta como não definida.
const optionalString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional(),
);

const emailSchema = z.email();

// Remetente no formato `email` ou `Nome <email>` (aceito pelo Nodemailer).
const senderSchema = z
  .string()
  .trim()
  .refine((value) => {
    const match = value.match(/^(?:[^<>]+<([^<>\s]+)>|([^<>\s]+))$/);
    const address = match?.[1] ?? match?.[2];
    return address !== undefined && emailSchema.safeParse(address).success;
  }, 'Expected "email" or "Name <email>"');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3333),
    DATABASE_URL: z.url(),
    // Raiz onde as imagens processadas são gravadas (relativa ao diretório de trabalho ou absoluta).
    UPLOAD_DIR: z.string().trim().min(1).default('uploads'),
    // Servidor SMTP do e-mail de nova reply. Em dev/teste é o Mailpit (docker-compose.yml).
    SMTP_HOST: z.string().trim().min(1),
    // `z.coerce` transformaria '' em 0: só dígitos passam, e a conversão vem depois.
    SMTP_PORT: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(65535)),
    SMTP_FROM: senderSchema,
    // Credenciais opcionais (o Mailpit não exige), mas sempre em par.
    SMTP_USER: optionalString,
    SMTP_PASS: optionalString,
    // Prefixo das chaves das filas BullMQ no Redis. `bull` é o que o Bull Board lê; os testes
    // usam outro para não misturar jobs com os de dev no mesmo Redis.
    QUEUE_PREFIX: z.string().trim().min(1).default('bull'),
  })
  .refine((env) => (env.SMTP_USER === undefined) === (env.SMTP_PASS === undefined), {
    message: 'SMTP_USER and SMTP_PASS must be set together',
    path: ['SMTP_USER'],
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', z.treeifyError(parsed.error));
  throw new Error('Invalid environment variables');
}

export const env = parsed.data;
