/**
 * Identificador curto de um erro para logs: o `code` (ex.: `ECONNREFUSED`, `EENVELOPE`) ou o nome.
 * Nunca a `message`: mensagens de SMTP/Redis costumam citar endereços e dados do job.
 */
export function errorCode(error: unknown): string {
  if (error instanceof Error) {
    const { code } = error as Error & { code?: unknown };
    return typeof code === 'string' ? code : error.name;
  }
  return 'UnknownError';
}
