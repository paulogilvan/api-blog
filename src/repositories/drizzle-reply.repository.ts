import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { replies, users } from '../db/schema.ts';
import { isPgError, PG_FOREIGN_KEY_VIOLATION } from './pg-error.ts';
import type { ReplyRepository } from './reply.repository.ts';

// Nome gerado pelo drizzle-kit na migration 0002 para a FK replies.post_id → posts.id.
const POST_FK_CONSTRAINT = 'replies_post_id_posts_id_fk';

const replyColumns = {
  id: replies.id,
  content: replies.content,
  createdAt: replies.createdAt,
};

/** Adapter Drizzle para o ReplyRepository. */
export class DrizzleReplyRepository implements ReplyRepository {
  async create(data: { content: string; postId: number; authorId: number }) {
    try {
      const [reply] = await db.insert(replies).values(data).returning(replyColumns);
      return reply;
    } catch (error) {
      // A FK é quem garante que o post existe (inclusive se ele for apagado no meio da
      // requisição). Outras violações (ex.: usuário apagado) seguem como erro inesperado.
      if (isPgError(error, PG_FOREIGN_KEY_VIOLATION, POST_FK_CONSTRAINT)) return null;
      throw error;
    }
  }

  async findManyByPostId(postId: number) {
    const rows = await db
      .select({ ...replyColumns, authorId: users.id, authorName: users.name })
      .from(replies)
      .innerJoin(users, eq(replies.authorId, users.id))
      .where(eq(replies.postId, postId))
      // `id` desempata replies com o mesmo createdAt; a ordem bate com o índice
      // (post_id, created_at, id).
      .orderBy(asc(replies.createdAt), asc(replies.id));

    // Autor exposto só com id e nome (nunca o e-mail).
    return rows.map(({ authorId, authorName, ...reply }) => ({
      ...reply,
      author: { id: authorId, name: authorName },
    }));
  }

  async findAuthorId({ replyId, postId }: { replyId: number; postId: number }) {
    const [reply] = await db
      .select({ authorId: replies.authorId })
      .from(replies)
      .where(and(eq(replies.id, replyId), eq(replies.postId, postId)))
      .limit(1);

    return reply?.authorId ?? null;
  }

  async delete({ replyId, postId }: { replyId: number; postId: number }) {
    const deleted = await db
      .delete(replies)
      .where(and(eq(replies.id, replyId), eq(replies.postId, postId)))
      .returning({ id: replies.id });

    return deleted.length > 0;
  }
}
