import { z } from 'zod';

// Maior valor da coluna `integer` do Postgres: ids acima disso nem chegam ao banco.
export const PG_INT_MAX = 2_147_483_647;

// Inteiro positivo vindo da URL (params/query). Só aceita dígitos decimais sem zero à
// esquerda: `Number()` (usado por z.coerce) aceitaria "0x10", "1e1", " 1 " e "1.0",
// fazendo o mesmo recurso responder por várias URLs.
export const positiveIntFromString = (message: string) =>
  z
    .string()
    .regex(/^[1-9]\d*$/, message)
    .transform(Number)
    .pipe(z.number().int().positive().max(PG_INT_MAX));
