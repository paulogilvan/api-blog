export type ReplyRecord = { id: number; content: string; createdAt: Date };

export type ReplyWithAuthorRecord = ReplyRecord & { author: { id: number; name: string } };

/** Abstração de persistência de replies: os use cases dependem só disto, nunca do ORM. */
export interface ReplyRepository {
  /** Cria a reply no post. Retorna `null` quando o post não existe. */
  create(data: { content: string; postId: number; authorId: number }): Promise<ReplyRecord | null>;
}
