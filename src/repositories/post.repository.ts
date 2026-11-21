export type PostRecord = { id: number; title: string; content: string; createdAt: Date };

export type PostWithAuthorRecord = PostRecord & { author: { id: number; name: string } };

/** Abstração de persistência de posts: o service depende só disto, nunca do ORM. */
export interface PostRepository {
  findMany(params: {
    limit: number;
    offset: number;
  }): Promise<{ rows: PostWithAuthorRecord[]; total: number }>;
  findById(id: number): Promise<PostWithAuthorRecord | null>;
  findAuthorId(id: number): Promise<number | null>;
  create(data: { title: string; content: string; authorId: number }): Promise<PostRecord>;
  update(id: number, data: { title?: string; content?: string }): Promise<PostRecord | null>;
  delete(id: number): Promise<boolean>;
}
