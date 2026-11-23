export type ReplyRecord = { id: number; content: string; createdAt: Date };

export type ReplyWithAuthorRecord = ReplyRecord & { author: { id: number; name: string } };

/** Abstração de persistência de replies: os use cases dependem só disto, nunca do ORM. */
export interface ReplyRepository {
  /** Cria a reply no post. Retorna `null` quando o post não existe. */
  create(data: { content: string; postId: number; authorId: number }): Promise<ReplyRecord | null>;
  /** Todas as replies do post (sem paginação), da mais antiga para a mais nova. */
  findManyByPostId(postId: number): Promise<ReplyWithAuthorRecord[]>;
  /**
   * Autor da reply, buscando-a **dentro do post** informado. Retorna `null` se a reply não
   * existe ou pertence a outro post.
   */
  findAuthorId(params: { replyId: number; postId: number }): Promise<number | null>;
  /** Apaga a reply do post. Retorna `false` se ela não existia (ex.: apagada em paralelo). */
  delete(params: { replyId: number; postId: number }): Promise<boolean>;
}
