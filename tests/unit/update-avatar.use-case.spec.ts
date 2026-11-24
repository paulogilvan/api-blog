import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/errors/app-error.ts';
import type {
  UserProfileRecord,
  UserRepository,
} from '../../src/repositories/user.repository.ts';
import { UpdateAvatarUseCase } from '../../src/use-cases/users/update-avatar.use-case.ts';
import type { FileStorage } from '../../src/utils/file-storage.ts';
import type { ImageProcessor } from '../../src/utils/image-processor.ts';

const profile: UserProfileRecord = {
  id: 1,
  name: 'John Doe',
  email: 'john@example.com',
  avatarPath: 'avatars/new.webp',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

function setup(overrides: {
  updateAvatarPath?: UserRepository['updateAvatarPath'];
  process?: ImageProcessor['process'];
  delete?: FileStorage['delete'];
} = {}) {
  const userRepository = {
    updateAvatarPath: vi.fn(
      overrides.updateAvatarPath ??
        (async () => ({ user: profile, previousAvatarPath: 'avatars/old.webp' })),
    ),
  };
  const imageProcessor = {
    process: vi.fn(overrides.process ?? (async () => Buffer.from('processed'))),
  };
  const fileStorage = {
    save: vi.fn(async () => 'avatars/new.webp'),
    delete: vi.fn(overrides.delete ?? (async () => {})),
  };

  const useCase = new UpdateAvatarUseCase(
    userRepository as unknown as UserRepository,
    imageProcessor,
    fileStorage,
  );

  return { useCase, userRepository, imageProcessor, fileStorage };
}

describe('UpdateAvatarUseCase', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('processes with the avatar preset, saves under avatars/ and persists the path', async () => {
    const { useCase, imageProcessor, fileStorage, userRepository } = setup();
    const image = Buffer.from('raw');

    const result = await useCase.execute({ userId: 1, image });

    expect(imageProcessor.process).toHaveBeenCalledWith(image, 'avatar');
    expect(fileStorage.save).toHaveBeenCalledWith('avatars', Buffer.from('processed'), 'webp');
    expect(userRepository.updateAvatarPath).toHaveBeenCalledWith(1, 'avatars/new.webp');
    expect(result).toEqual(profile);
  });

  it('deletes the previous file after the database update', async () => {
    const { useCase, fileStorage } = setup();

    await useCase.execute({ userId: 1, image: Buffer.from('raw') });

    expect(fileStorage.delete).toHaveBeenCalledExactlyOnceWith('avatars/old.webp');
  });

  it('does not delete anything when there was no previous avatar', async () => {
    const { useCase, fileStorage } = setup({
      updateAvatarPath: async () => ({ user: profile, previousAvatarPath: null }),
    });

    await useCase.execute({ userId: 1, image: Buffer.from('raw') });

    expect(fileStorage.delete).not.toHaveBeenCalled();
  });

  it('does not touch the disk when the image is invalid', async () => {
    const { useCase, fileStorage, userRepository } = setup({
      process: async () => {
        throw new AppError('VALIDATION_ERROR', 'Invalid image');
      },
    });

    await expect(useCase.execute({ userId: 1, image: Buffer.from('x') })).rejects.toThrow(
      'Invalid image',
    );
    expect(fileStorage.save).not.toHaveBeenCalled();
    expect(userRepository.updateAvatarPath).not.toHaveBeenCalled();
  });

  it('removes the new file and rethrows when the database update fails', async () => {
    const dbError = new Error('connection lost');
    const { useCase, fileStorage } = setup({
      updateAvatarPath: async () => {
        throw dbError;
      },
    });

    await expect(useCase.execute({ userId: 1, image: Buffer.from('raw') })).rejects.toBe(dbError);
    expect(fileStorage.delete).toHaveBeenCalledExactlyOnceWith('avatars/new.webp');
  });

  it('removes the new file and returns 401 when the user no longer exists', async () => {
    const { useCase, fileStorage } = setup({ updateAvatarPath: async () => null });

    const error = await useCase.execute({ userId: 1, image: Buffer.from('raw') }).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('UNAUTHORIZED');
    expect(fileStorage.delete).toHaveBeenCalledExactlyOnceWith('avatars/new.webp');
  });

  it('still succeeds when deleting the previous file fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { useCase } = setup({
      delete: async () => {
        throw new Error('EBUSY');
      },
    });

    const result = await useCase.execute({ userId: 1, image: Buffer.from('raw') });

    expect(result).toEqual(profile);
    expect(log).toHaveBeenCalled();
  });
});
