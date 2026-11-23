import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { postLikes } from '../db/schema.ts';
import type { LikeRepository } from './like.repository.ts';
import { isPgError, PG_FOREIGN_KEY_VIOLATION } from './pg-error.ts';

// Nome gerado pelo drizzle-kit na migration 0002 para a FK post_likes.post_id → posts.id.
const POST_FK_CONSTRAINT = 'post_likes_post_id_posts_id_fk';

/** Adapter Drizzle para o LikeRepository. */
export class DrizzleLikeRepository implements LikeRepository {
  async add(data: { postId: number; userId: number }) {
    try {
      // A PK (post_id, user_id) + ON CONFLICT DO NOTHING torna o like idempotente mesmo
      // com requisições concorrentes do mesmo usuário, sem checagem prévia.
      await db.insert(postLikes).values(data).onConflictDoNothing();
      return true;
    } catch (error) {
      // A FK é quem garante que o post existe (inclusive se ele for apagado no meio da
      // requisição). Outras violações (ex.: usuário apagado) seguem como erro inesperado.
      if (isPgError(error, PG_FOREIGN_KEY_VIOLATION, POST_FK_CONSTRAINT)) return false;
      throw error;
    }
  }

  async countByPostId(postId: number) {
    return db.$count(postLikes, eq(postLikes.postId, postId));
  }
}
