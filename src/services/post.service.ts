import { db } from '../db/index.ts';
import { posts } from '../db/schema.ts';
import type { CreatePostInput } from '../schemas/post.schema.ts';

export type PostAuthor = { id: number; name: string };

export type PostResult = {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  author: PostAuthor;
};

export async function createPost(input: CreatePostInput, author: PostAuthor): Promise<PostResult> {
  const [post] = await db
    .insert(posts)
    .values({ title: input.title, content: input.content, authorId: author.id })
    .returning({
      id: posts.id,
      title: posts.title,
      content: posts.content,
      createdAt: posts.createdAt,
    });

  return {
    id: post.id,
    title: post.title,
    content: post.content,
    createdAt: post.createdAt.toISOString(),
    author: { id: author.id, name: author.name },
  };
}
