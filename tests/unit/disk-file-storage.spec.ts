import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DiskFileStorage } from '../../src/utils/disk-file-storage.ts';

const root = path.resolve('tmp/disk-file-storage-test');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('DiskFileStorage', () => {
  let storage: DiskFileStorage;

  beforeEach(async () => {
    await rm(root, { recursive: true, force: true });
    storage = new DiskFileStorage(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('saves the buffer under <dir>/<uuid>.<ext>, creating the folder, and returns a posix relative path', async () => {
    const relative = await storage.save('avatars', Buffer.from('data'), 'webp');

    const [dir, file] = relative.split('/');
    expect(dir).toBe('avatars');
    expect(file.replace(/\.webp$/, '')).toMatch(UUID);
    expect(await readFile(path.join(root, relative), 'utf8')).toBe('data');
  });

  it('generates a different name on every save', async () => {
    const a = await storage.save('avatars', Buffer.from('a'), 'webp');
    const b = await storage.save('avatars', Buffer.from('b'), 'webp');

    expect(a).not.toBe(b);
  });

  it('deletes a saved file', async () => {
    const relative = await storage.save('avatars', Buffer.from('data'), 'webp');

    await storage.delete(relative);

    expect(existsSync(path.join(root, relative))).toBe(false);
  });

  it('treats deleting a missing file as a no-op', async () => {
    await expect(storage.delete('avatars/missing.webp')).resolves.toBeUndefined();
  });

  it('refuses to delete paths outside the upload root', async () => {
    const outside = path.resolve('tmp/outside-upload-root.txt');
    await mkdir(path.dirname(outside), { recursive: true });
    await writeFile(outside, 'keep me');

    try {
      await expect(storage.delete('../outside-upload-root.txt')).rejects.toThrow();
      await expect(storage.delete(outside)).rejects.toThrow();
      expect(existsSync(outside)).toBe(true);
    } finally {
      await rm(outside, { force: true });
    }
  });

  it('refuses to save into a directory outside the upload root', async () => {
    await expect(storage.save('../escape', Buffer.from('x'), 'webp')).rejects.toThrow();
  });
});
