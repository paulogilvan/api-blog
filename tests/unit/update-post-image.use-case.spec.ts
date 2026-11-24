import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/errors/app-error.ts';
import type {
  PostCountersRecord,
  PostRecord,
  PostRepository,
} from '../../src/repositories/post.repository.ts';
import { UpdatePostImageUseCase } from '../../src/use-cases/posts/update-post-image.use-case.ts';
import type { FileStorage } from '../../src/utils/file-storage.ts';
import type { ImageProcessor } from '../../src/utils/image-processor.ts';

const owner = { id: 1, name: 'John Doe' };

const storedPost: PostRecord & PostCountersRecord = {
  id: 10,
  title: 'Title',
  content: 'Content',
  imagePath: 'posts/new.webp',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  likesCount: 2,
  repliesCount: 1,
};

function setup(
  overrides: {
    findAuthorId?: PostRepository['findAuthorId'];
    updateImagePath?: PostRepository['updateImagePath'];
    process?: ImageProcessor['process'];
    delete?: FileStorage['delete'];
  } = {},
) {
  const postRepository = {
    findAuthorId: vi.fn(overrides.findAuthorId ?? (async () => owner.id)),
    updateImagePath: vi.fn(
      overrides.updateImagePath ??
        (async () => ({ post: storedPost, previousImagePath: 'posts/old.webp' })),
    ),
  };
  const imageProcessor = {
    process: vi.fn(overrides.process ?? (async () => Buffer.from('processed'))),
  };
  const fileStorage = {
    save: vi.fn(async () => 'posts/new.webp'),
    delete: vi.fn(overrides.delete ?? (async () => {})),
  };

  const useCase = new UpdatePostImageUseCase(
    postRepository as unknown as PostRepository,
    imageProcessor,
    fileStorage,
  );

  return { useCase, postRepository, imageProcessor, fileStorage };
}

const input = () => ({ postId: 10, image: Buffer.from('raw'), user: owner });

describe('UpdatePostImageUseCase', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('processes with the post preset, saves under posts/ and persists the path', async () => {
    const { useCase, imageProcessor, fileStorage, postRepository } = setup();
    const data = input();

    const result = await useCase.execute(data);

    expect(imageProcessor.process).toHaveBeenCalledWith(data.image, 'post');
    expect(fileStorage.save).toHaveBeenCalledWith('posts', Buffer.from('processed'), 'webp');
    expect(postRepository.updateImagePath).toHaveBeenCalledWith(10, 'posts/new.webp');
    expect(result).toEqual({ ...storedPost, author: owner });
  });

  it('deletes the previous file after the database update', async () => {
    const { useCase, fileStorage } = setup();

    await useCase.execute(input());

    expect(fileStorage.delete).toHaveBeenCalledExactlyOnceWith('posts/old.webp');
  });

  it('does not delete anything when the post had no image', async () => {
    const { useCase, fileStorage } = setup({
      updateImagePath: async () => ({ post: storedPost, previousImagePath: null }),
    });

    await useCase.execute(input());

    expect(fileStorage.delete).not.toHaveBeenCalled();
  });

  it('checks ownership before processing the image', async () => {
    const { useCase, imageProcessor, fileStorage } = setup({ findAuthorId: async () => 2 });

    const error = await useCase.execute(input()).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('FORBIDDEN');
    expect(imageProcessor.process).not.toHaveBeenCalled();
    expect(fileStorage.save).not.toHaveBeenCalled();
  });

  it('does not touch the disk when the image is invalid', async () => {
    const { useCase, fileStorage, postRepository } = setup({
      process: async () => {
        throw new AppError('VALIDATION_ERROR', 'Invalid image');
      },
    });

    await expect(useCase.execute(input())).rejects.toThrow('Invalid image');
    expect(fileStorage.save).not.toHaveBeenCalled();
    expect(postRepository.updateImagePath).not.toHaveBeenCalled();
  });

  it('removes the new file and rethrows when the database update fails', async () => {
    const dbError = new Error('connection lost');
    const { useCase, fileStorage } = setup({
      updateImagePath: async () => {
        throw dbError;
      },
    });

    await expect(useCase.execute(input())).rejects.toBe(dbError);
    expect(fileStorage.delete).toHaveBeenCalledExactlyOnceWith('posts/new.webp');
  });

  it('removes the new file and returns 404 when the post disappears before the update', async () => {
    const { useCase, fileStorage } = setup({ updateImagePath: async () => null });

    const error = await useCase.execute(input()).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('NOT_FOUND');
    expect(fileStorage.delete).toHaveBeenCalledExactlyOnceWith('posts/new.webp');
  });

  it('keeps the original error when the compensation delete also fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const dbError = new Error('connection lost');
    const { useCase } = setup({
      updateImagePath: async () => {
        throw dbError;
      },
      delete: async () => {
        throw new Error('EBUSY');
      },
    });

    await expect(useCase.execute(input())).rejects.toBe(dbError);
  });

  it('still succeeds when deleting the previous file fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { useCase } = setup({
      delete: async () => {
        throw new Error('EBUSY');
      },
    });

    const result = await useCase.execute(input());

    expect(result).toEqual({ ...storedPost, author: owner });
    expect(log).toHaveBeenCalled();
  });
});
