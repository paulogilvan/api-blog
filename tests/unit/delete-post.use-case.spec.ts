import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PostRepository } from '../../src/repositories/post.repository.ts';
import { DeletePostUseCase } from '../../src/use-cases/posts/delete-post.use-case.ts';
import type { FileStorage } from '../../src/utils/file-storage.ts';

function setup(
  overrides: { delete?: PostRepository['delete']; deleteFile?: FileStorage['delete'] } = {},
) {
  const postRepository = {
    findAuthorId: vi.fn(async () => 1),
    delete: vi.fn(overrides.delete ?? (async () => ({ imagePath: 'posts/photo.webp' }))),
  };
  const fileStorage = {
    save: vi.fn(),
    delete: vi.fn(overrides.deleteFile ?? (async () => {})),
  };

  const useCase = new DeletePostUseCase(
    postRepository as unknown as PostRepository,
    fileStorage as unknown as FileStorage,
  );

  return { useCase, postRepository, fileStorage };
}

describe('DeletePostUseCase', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deletes the image file after deleting the post', async () => {
    const { useCase, postRepository, fileStorage } = setup();

    await useCase.execute({ postId: 10, userId: 1 });

    expect(postRepository.delete).toHaveBeenCalledWith(10);
    expect(fileStorage.delete).toHaveBeenCalledExactlyOnceWith('posts/photo.webp');
  });

  it('does not touch the disk when the post had no image', async () => {
    const { useCase, fileStorage } = setup({ delete: async () => ({ imagePath: null }) });

    await useCase.execute({ postId: 10, userId: 1 });

    expect(fileStorage.delete).not.toHaveBeenCalled();
  });

  it('still succeeds when deleting the image file fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { useCase } = setup({
      deleteFile: async () => {
        throw new Error('EBUSY');
      },
    });

    await expect(useCase.execute({ postId: 10, userId: 1 })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
  });

  it('returns 404 when the post disappears before the delete', async () => {
    const { useCase, fileStorage } = setup({ delete: async () => null });

    await expect(useCase.execute({ postId: 10, userId: 1 })).rejects.toThrow('Post not found');
    expect(fileStorage.delete).not.toHaveBeenCalled();
  });
});
