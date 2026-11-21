/** Abstração de hash de senha: os use cases dependem só disto, nunca do bcrypt. */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  /**
   * Compara a senha com o hash. Com `hash` nulo (usuário inexistente) deve retornar `false`
   * levando o mesmo tempo de uma comparação real, para não revelar se o e-mail existe.
   */
  verify(plain: string, hash: string | null): Promise<boolean>;
}
