import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { postLikes, posts, replies, users } from '../db/schema.ts';
import type {
  PostCountersRecord,
  PostRecord,
  PostRepository,
  PostWithAuthorRecord,
} from './post.repository.ts';

const postColumns = {
  id: posts.id,
  title: posts.title,
  content: posts.content,
  imagePath: posts.imagePath,
  createdAt: posts.createdAt,
};

// Subconsultas correlacionadas: contam likes e replies de cada post usando índices que
// começam por `post_id` (PK de post_likes e replies_post_id_created_at_id_idx), sem
// GROUP BY que atrapalharia a paginação.
// `count(*)` é bigint no Postgres (chega como string no driver): `::int` + mapWith(Number).
const likesCount = sql<number>`(select count(*)::int from ${postLikes} where ${postLikes.postId} = ${posts.id})`.mapWith(
  Number,
);
const repliesCount = sql<number>`(select count(*)::int from ${replies} where ${replies.postId} = ${posts.id})`.mapWith(
  Number,
);

const postWithCountersColumns = { ...postColumns, likesCount, repliesCount };

// Post + contadores + nome do autor (nunca o e-mail), para as rotas públicas.
const publicPostColumns = {
  ...postWithCountersColumns,
  authorId: users.id,
  authorName: users.name,
};

type PublicPostRow = PostRecord & PostCountersRecord & { authorId: number; authorName: string };

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
      // A resposta do PUT inclui os contadores: calculados no próprio RETURNING.
      .returning(postWithCountersColumns);

    return post ?? null;
  }

  async updateImagePath(id: number, imagePath: string) {
    // Ler o caminho anterior e gravar o novo na mesma transação, com a linha travada (FOR UPDATE):
    // dois uploads simultâneos no mesmo post não leem o mesmo "anterior", o que deixaria
    // um arquivo órfão no disco.
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select({ imagePath: posts.imagePath })
        .from(posts)
        .where(eq(posts.id, id))
        .for('update');
      if (!current) return null;

      const [post] = await tx
        .update(posts)
        .set({ imagePath })
        .where(eq(posts.id, id))
        .returning(postWithCountersColumns);

      return { post, previousImagePath: current.imagePath };
    });
  }

  async delete(id: number) {
    // O RETURNING devolve o caminho da imagem da linha apagada: sem leitura prévia separada,
    // que poderia ver uma imagem já trocada por um upload simultâneo.
    const [deleted] = await db
      .delete(posts)
      .where(eq(posts.id, id))
      .returning({ imagePath: posts.imagePath });
    return deleted ?? null;
  }
}
