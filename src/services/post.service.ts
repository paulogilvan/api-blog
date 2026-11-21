import { AppError } from '../errors/app-error.ts';
import type { PostRepository, PostWithAuthorRecord } from '../repositories/post.repository.ts';
import type { CreatePostInput, UpdatePostInput } from '../schemas/post.schema.ts';

export const POSTS_PER_PAGE = 10;

export type PostAuthor = { id: number; name: string };

const postNotFound = () => new AppError('NOT_FOUND', 'Post not found');

export class PostService {
  private readonly postRepository: PostRepository;

  constructor(postRepository: PostRepository) {
    this.postRepository = postRepository;
  }

  /** Garante que o post existe (404) e pertence ao usuário (403). */
  private async assertOwnership(postId: number, userId: number, forbiddenMessage: string) {
    const authorId = await this.postRepository.findAuthorId(postId);

    if (authorId === null) throw postNotFound();
    if (authorId !== userId) throw new AppError('FORBIDDEN', forbiddenMessage);
  }

  async listPosts(
    page: number,
  ): Promise<{ posts: PostWithAuthorRecord[]; total: number; limit: number }> {
    const limit = POSTS_PER_PAGE;
    const offset = (page - 1) * limit;

    const { rows, total } = await this.postRepository.findMany({ limit, offset });

    return { posts: rows, total, limit };
  }

  async getPostById(postId: number): Promise<PostWithAuthorRecord> {
    const post = await this.postRepository.findById(postId);

    if (!post) throw postNotFound();

    return post;
  }

  async createPost(input: CreatePostInput, author: PostAuthor): Promise<PostWithAuthorRecord> {
    const post = await this.postRepository.create({
      title: input.title,
      content: input.content,
      authorId: author.id,
    });

    return { ...post, author: { id: author.id, name: author.name } };
  }

  async updatePost(
    postId: number,
    input: UpdatePostInput,
    user: PostAuthor,
  ): Promise<PostWithAuthorRecord> {
    await this.assertOwnership(postId, user.id, 'You can only update your own posts');

    const post = await this.postRepository.update(postId, input);

    // Post apagado entre a checagem e o update.
    if (!post) throw postNotFound();

    // O dono do post é o próprio usuário autenticado.
    return { ...post, author: { id: user.id, name: user.name } };
  }

  async deletePost(postId: number, userId: number): Promise<void> {
    await this.assertOwnership(postId, userId, 'You can only delete your own posts');

    const deleted = await this.postRepository.delete(postId);

    if (!deleted) throw postNotFound();
  }
}
