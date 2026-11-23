import type { PostWithAuthorRecord } from '../repositories/post.repository.ts';
import type { PostDetailRecord } from '../use-cases/posts/get-post.use-case.ts';
import type { ListPostsOutput } from '../use-cases/posts/list-posts.use-case.ts';

/** Formato público de um post na API (`PostSummary` do contrato): listagem, criação e edição. */
export type PostOutputDTO = {
  id: number;
  title: string;
  content: string;
  /** ISO 8601 */
  createdAt: string;
  author: { id: number; name: string };
  likesCount: number;
};

/** Post individual (`PostDetail` do contrato): `GET /posts/:id`. */
export type PostDetailOutputDTO = PostOutputDTO & { likedByMe: boolean };

export type PaginationMetaDTO = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type PostListOutputDTO = { data: PostOutputDTO[]; meta: PaginationMetaDTO };

// Escolhe os campos explicitamente: nada além disso vai para a resposta.
export function toPostOutputDTO(post: PostWithAuthorRecord): PostOutputDTO {
  return {
    id: post.id,
    title: post.title,
    content: post.content,
    createdAt: post.createdAt.toISOString(),
    author: { id: post.author.id, name: post.author.name },
    likesCount: post.likesCount,
  };
}

export function toPostDetailOutputDTO(post: PostDetailRecord): PostDetailOutputDTO {
  return { ...toPostOutputDTO(post), likedByMe: post.likedByMe };
}

export function toPostListOutputDTO(
  { posts, total, limit }: ListPostsOutput,
  page: number,
): PostListOutputDTO {
  return {
    data: posts.map(toPostOutputDTO),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
