import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PostRepository } from '../../src/repositories/post.repository.ts';
import type { ReplyRepository } from '../../src/repositories/reply.repository.ts';
import { CreateReplyUseCase } from '../../src/use-cases/replies/create-reply.use-case.ts';
import type { Mailer } from '../../src/utils/mailer.ts';

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
    send?: Mailer['send'];
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
  const mailer = { send: vi.fn(overrides.send ?? (async () => {})) };

  const useCase = new CreateReplyUseCase(
    replyRepository as unknown as ReplyRepository,
    postRepository as unknown as PostRepository,
    mailer,
  );

  return { useCase, replyRepository, postRepository, mailer };
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

  it('e-mails the post author after creating the reply', async () => {
    const { useCase, mailer, postRepository } = setup();

    await useCase.execute(input());

    expect(postRepository.findWithAuthorContact).toHaveBeenCalledWith(5);
    expect(mailer.send).toHaveBeenCalledOnce();
    const message = mailer.send.mock.calls[0][0];
    expect(message.to).toBe('john@example.com');
    expect(message.subject).toBe('New reply on "My post"');
    expect(message.text).toContain('Jane Roe');
    expect(message.text).toContain('Great post!');
    expect(message.html).toContain('Jane Roe');
  });

  it('does not e-mail when the post author replies to their own post', async () => {
    const { useCase, mailer } = setup();

    await useCase.execute(input({ id: postOwner.id, name: postOwner.name }));

    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('does not look up nor e-mail when the post does not exist (404)', async () => {
    const { useCase, mailer, postRepository } = setup({ create: async () => null });

    await expect(useCase.execute(input())).rejects.toThrow('Post not found');
    expect(postRepository.findWithAuthorContact).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('skips the e-mail when the post disappears right after the reply', async () => {
    const { useCase, mailer } = setup({ findWithAuthorContact: async () => null });

    const result = await useCase.execute(input());

    expect(result.id).toBe(storedReply.id);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('still returns the reply when sending the e-mail fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { useCase } = setup({
      send: async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:1026');
      },
    });

    const result = await useCase.execute(input());

    expect(result).toEqual({ ...storedReply, author: replier });
  });

  it('still returns the reply when looking up the post author fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { useCase, mailer } = setup({
      findWithAuthorContact: async () => {
        throw new Error('connection lost');
      },
    });

    const result = await useCase.execute(input());

    expect(result.id).toBe(storedReply.id);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('logs the failure without the recipient address nor the reply content', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { useCase } = setup({
      send: async () => {
        // Erros de SMTP costumam citar o destinatário na mensagem.
        throw Object.assign(new Error('Recipient rejected: john@example.com'), {
          code: 'EENVELOPE',
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
    expect(logged).toContain('EENVELOPE');
  });
});
