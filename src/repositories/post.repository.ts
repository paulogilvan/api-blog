export type PostRecord = { id: number; title: string; content: string; createdAt: Date };

/** Contadores derivados de outras tabelas, calculados na leitura (não são colunas de `posts`). */
export type PostCountersRecord = { likesCount: number };

export type PostWithAuthorRecord = PostRecord &
  PostCountersRecord & { author: { id: number; name: string } };

/** Abstração de persistência de posts: os use cases dependem só disto, nunca do ORM. */
export interface PostRepository {
  findMany(params: {
    limit: number;
    offset: number;
  }): Promise<{ rows: PostWithAuthorRecord[]; total: number }>;
  findById(id: number): Promise<PostWithAuthorRecord | null>;
  findAuthorId(id: number): Promise<number | null>;
  create(data: { title: string; content: string; authorId: number }): Promise<PostRecord>;
  update(
    id: number,
    data: { title?: string; content?: string },
  ): Promise<(PostRecord & PostCountersRecord) | null>;
  delete(id: number): Promise<boolean>;
}
