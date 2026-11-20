import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { posts, users } from '../db/schema.ts';
import { AppError } from '../errors/app-error.ts';
import type { CreatePostInput, UpdatePostInput } from '../schemas/post.schema.ts';

export const POSTS_PER_PAGE = 10;

export type PostAuthor = { id: number; name: string };

export type PostResult = {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  author: PostAuthor;
};

export type PostListResult = {
  data: PostResult[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

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

type PostRow = { id: number; title: string; content: string; createdAt: Date };
type PublicPostRow = PostRow & { authorId: number; authorName: string };

function toPostResult(post: PostRow, author: PostAuthor): PostResult {
  return {
    id: post.id,
    title: post.title,
    content: post.content,
    createdAt: post.createdAt.toISOString(),
    author: { id: author.id, name: author.name },
  };
}

function toPublicPostResult(row: PublicPostRow): PostResult {
  return toPostResult(row, { id: row.authorId, name: row.authorName });
}

const postNotFound = () => new AppError('NOT_FOUND', 'Post not found');

/** Garante que o post existe (404) e pertence ao usuário (403). */
async function assertOwnership(postId: number, userId: number, forbiddenMessage: string) {
  const [post] = await db
    .select({ authorId: posts.authorId })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  if (!post) throw postNotFound();
  if (post.authorId !== userId) throw new AppError('FORBIDDEN', forbiddenMessage);
}

export async function listPosts(page: number): Promise<PostListResult> {
  const limit = POSTS_PER_PAGE;
  const offset = (page - 1) * limit;

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

  return {
    data: rows.map(toPublicPostResult),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getPostById(postId: number): Promise<PostResult> {
  const [row] = await db
    .select(publicPostColumns)
    .from(posts)
    .innerJoin(users, eq(posts.authorId, users.id))
    .where(eq(posts.id, postId))
    .limit(1);

  if (!row) throw postNotFound();

  return toPublicPostResult(row);
}

export async function createPost(input: CreatePostInput, author: PostAuthor): Promise<PostResult> {
  const [post] = await db
    .insert(posts)
    .values({ title: input.title, content: input.content, authorId: author.id })
    .returning(postColumns);

  return toPostResult(post, author);
}

export async function updatePost(
  postId: number,
  input: UpdatePostInput,
  user: PostAuthor,
): Promise<PostResult> {
  await assertOwnership(postId, user.id, 'You can only update your own posts');

  const [post] = await db
    .update(posts)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
    })
    .where(eq(posts.id, postId))
    .returning(postColumns);

  // Post apagado entre a checagem e o update.
  if (!post) throw postNotFound();

  // O dono do post é o próprio usuário autenticado.
  return toPostResult(post, user);
}

export async function deletePost(postId: number, userId: number): Promise<void> {
  await assertOwnership(postId, userId, 'You can only delete your own posts');

  const deleted = await db.delete(posts).where(eq(posts.id, postId)).returning({ id: posts.id });

  if (deleted.length === 0) throw postNotFound();
}
