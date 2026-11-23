// Códigos SQLSTATE do Postgres tratados pelos adapters.
export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FOREIGN_KEY_VIOLATION = '23503';

type PgErrorInfo = { code?: unknown; constraint?: unknown };

/**
 * Procura o erro do driver `pg` na cadeia de `cause` (o Drizzle embrulha o erro original
 * em `DrizzleQueryError`) e diz se ele tem o código — e, opcionalmente, a constraint — dados.
 */
export function isPgError(error: unknown, code: string, constraint?: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code: errorCode, constraint: errorConstraint } = error as PgErrorInfo;
  if (errorCode === code && (constraint === undefined || errorConstraint === constraint)) {
    return true;
  }
  return isPgError((error as { cause?: unknown }).cause, code, constraint);
}
