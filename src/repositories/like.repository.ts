/** Abstração de persistência de likes: os use cases dependem só disto, nunca do ORM. */
export interface LikeRepository {
  /**
   * Registra o like do usuário no post. Idempotente: se o like já existe, nada muda.
   * Retorna `false` quando o post não existe.
   */
  add(data: { postId: number; userId: number }): Promise<boolean>;
  countByPostId(postId: number): Promise<number>;
}
