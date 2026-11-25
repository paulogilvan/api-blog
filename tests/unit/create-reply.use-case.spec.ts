import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EmailJobRepository } from '../../src/repositories/email-job.repository.ts';
import type { PostRepository } from '../../src/repositories/post.repository.ts';
import type { ReplyRepository } from '../../src/repositories/reply.repository.ts';
import { CreateReplyUseCase } from '../../src/use-cases/replies/create-reply.use-case.ts';

const postOwner = { id: 1, name: 'John Doe', email: 'john@example.com' };
const replier = { id: 2, name: 'Jane Roe' };

const storedReply = {
  id: 10,
  content: 'Great post!',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

function setup(
  overrides: {
    create?: ReplyRepository['create'];
    findWithAuthorContact?: PostRepository['findWithAuthorContact'];
    createNewReplyEmailJob?: EmailJobRepository['createNewReplyEmailJob'];
  } = {},
) {
  const replyRepository = {
    create: vi.fn(overrides.create ?? (async () => storedReply)),
  };
  const postRepository = {
    findWithAuthorContact: vi.fn(
      overrides.findWithAuthorContact ?? (async () => ({ title: 'My post', author: postOwner })),
    ),
  };
  const emailJobRepository = {
    createNewReplyEmailJob: vi.fn(overrides.createNewReplyEmailJob ?? (async () => {})),
  };

  const useCase = new CreateReplyUseCase(
    replyRepository as unknown as ReplyRepository,
    postRepository as unknown as PostRepository,
    emailJobRepository,
  );

  return { useCase, replyRepository, postRepository, emailJobRepository };
}

const input = (author = replier) => ({ postId: 5, data: { content: 'Great post!' }, author });

describe('CreateReplyUseCase', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates the reply and returns it with the author', async () => {
    const { useCase, replyRepository } = setup();

    const result = await useCase.execute(input());

    expect(replyRepository.create).toHaveBeenCalledWith({
      content: 'Great post!',
      postId: 5,
      authorId: replier.id,
    });
    expect(result).toEqual({ ...storedReply, author: replier });
  });

  it('creates the e-mail job with ready-to-use data for the post author', async () => {
    const { useCase, emailJobRepository, postRepository } = setup();

    await useCase.execute(input());

    expect(postRepository.findWithAuthorContact).toHaveBeenCalledWith(5);
    expect(emailJobRepository.createNewReplyEmailJob).toHaveBeenCalledExactlyOnceWith({
      to: 'john@example.com',
      recipientName: 'John Doe',
      replierName: 'Jane Roe',
      postTitle: 'My post',
      replyContent: 'Great post!',
    });
  });

  it('does not create the e-mail job when the post author replies to their own post', async () => {
    const { useCase, emailJobRepository } = setup();

    await useCase.execute(input({ id: postOwner.id, name: postOwner.name }));

    expect(emailJobRepository.createNewReplyEmailJob).not.toHaveBeenCalled();
  });

  it('does not look up nor create the e-mail job when the post does not exist (404)', async () => {
    const { useCase, emailJobRepository, postRepository } = setup({ create: async () => null });

    await expect(useCase.execute(input())).rejects.toThrow('Post not found');
    expect(postRepository.findWithAuthorContact).not.toHaveBeenCalled();
    expect(emailJobRepository.createNewReplyEmailJob).not.toHaveBeenCalled();
  });

  it('skips the e-mail job when the post disappears right after the reply', async () => {
    const { useCase, emailJobRepository } = setup({ findWithAuthorContact: async () => null });

    const result = await useCase.execute(input());

    expect(result.id).toBe(storedReply.id);
    expect(emailJobRepository.createNewReplyEmailJob).not.toHaveBeenCalled();
  });

  it('still returns the reply when creating the e-mail job fails (queue unavailable)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { useCase } = setup({
      createNewReplyEmailJob: async () => {
        throw Object.assign(new Error('Enqueue timed out after 2000ms'), { code: 'ETIMEDOUT' });
      },
    });

    const result = await useCase.execute(input());

    expect(result).toEqual({ ...storedReply, author: replier });
  });

  it('still returns the reply when looking up the post author fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { useCase, emailJobRepository } = setup({
      findWithAuthorContact: async () => {
        throw new Error('connection lost');
      },
    });

    const result = await useCase.execute(input());

    expect(result.id).toBe(storedReply.id);
    expect(emailJobRepository.createNewReplyEmailJob).not.toHaveBeenCalled();
  });

  it('logs the failure without the recipient address nor the reply content', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { useCase } = setup({
      createNewReplyEmailJob: async () => {
        // A mensagem de erro pode citar dados do job.
        throw Object.assign(new Error('Cannot enqueue job for john@example.com: Great post!'), {
          code: 'ECONNREFUSED',
        });
      },
    });

    await useCase.execute(input());

    expect(log).toHaveBeenCalledOnce();
    const logged = JSON.stringify(log.mock.calls[0], (_key, value) =>
      value instanceof Error ? { message: value.message, stack: value.stack } : value,
    );
    expect(logged).not.toContain('john@example.com');
    expect(logged).not.toContain('Great post!');
    expect(logged).toContain('ECONNREFUSED');
  });
});
