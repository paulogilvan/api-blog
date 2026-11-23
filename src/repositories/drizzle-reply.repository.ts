import { db } from '../db/index.ts';
import { replies } from '../db/schema.ts';
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
}
