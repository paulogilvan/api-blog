import { AppError } from '../../errors/app-error.ts';
import type { PostRepository } from '../../repositories/post.repository.ts';

export type PostAuthor = { id: number; name: string };

export const postNotFound = () => new AppError('NOT_FOUND', 'Post not found');

/** Garante que o post existe (404) e pertence ao usuário (403). */
export async function ensurePostOwnership(
  postRepository: PostRepository,
  postId: number,
  userId: number,
  forbiddenMessage: string,
): Promise<void> {
  const authorId = await postRepository.findAuthorId(postId);

  if (authorId === null) throw postNotFound();
  if (authorId !== userId) throw new AppError('FORBIDDEN', forbiddenMessage);
}
