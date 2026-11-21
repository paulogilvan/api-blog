/** Abstração de geração de token de sessão. */
export interface TokenGenerator {
  generate(): string;
}
