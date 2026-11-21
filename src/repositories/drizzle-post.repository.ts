import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { posts, users } from '../db/schema.ts';
import type { PostRecord, PostRepository, PostWithAuthorRecord } from './post.repository.ts';

const postColumns = {
  id: posts.id,
  title: posts.title,
  content: posts.content,
  createdAt: posts.createdAt,
};

// Post + nome do autor (nunca o e-mail), para as rotas públicas.
const publicPostColumns = {
  ...postColumns,
  authorId: users.id,
  authorName: users.name,
};

type PublicPostRow = PostRecord & { authorId: number; authorName: string };

function toPostWithAuthor({ authorId, authorName, ...post }: PublicPostRow): PostWithAuthorRecord {
  return { ...post, author: { id: authorId, name: authorName } };
}

/** Adapter Drizzle para o PostRepository. */
export class DrizzlePostRepository implements PostRepository {
  async findMany({ limit, offset }: { limit: number; offset: number }) {
    // Página e contagem no mesmo snapshot: o `total` sempre bate com os dados retornados.
    const { rows, total } = await db.transaction(
      async (tx) => {
        const rows = await tx
          .select(publicPostColumns)
          .from(posts)
          .innerJoin(users, eq(posts.authorId, users.id))
          // `id` desempata posts com o mesmo createdAt, mantendo a paginação estável.
          .orderBy(desc(posts.createdAt), desc(posts.id))
          .limit(limit)
          .offset(offset);
        const total = await tx.$count(posts);
        return { rows, total };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );

    return { rows: rows.map(toPostWithAuthor), total };
  }

  async findById(id: number) {
    const [row] = await db
      .select(publicPostColumns)
      .from(posts)
      .innerJoin(users, eq(posts.authorId, users.id))
      .where(eq(posts.id, id))
      .limit(1);

    return row ? toPostWithAuthor(row) : null;
  }

  async findAuthorId(id: number) {
    const [post] = await db
      .select({ authorId: posts.authorId })
      .from(posts)
      .where(eq(posts.id, id))
      .limit(1);

    return post?.authorId ?? null;
  }

  async create(data: { title: string; content: string; authorId: number }) {
    const [post] = await db.insert(posts).values(data).returning(postColumns);
    return post;
  }

  async update(id: number, data: { title?: string; content?: string }) {
    const [post] = await db
      .update(posts)
      .set({
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.content !== undefined ? { content: data.content } : {}),
      })
      .where(eq(posts.id, id))
      .returning(postColumns);

    return post ?? null;
  }

  async delete(id: number) {
    const deleted = await db.delete(posts).where(eq(posts.id, id)).returning({ id: posts.id });
    return deleted.length > 0;
  }
}
