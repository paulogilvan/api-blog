import { readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.ts';
import { db, pool } from '../../../src/db/index.ts';
import { users } from '../../../src/db/schema.ts';
import { registerUser } from '../../helpers/api.ts';
import { resetDatabase } from '../../helpers/database.ts';
import {
  listUploads,
  makeImage,
  readUploadMetadata,
  resetUploads,
  uploadPath,
} from '../../helpers/uploads.ts';

const app = createApp();

const UUID_WEBP = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/;
const AVATAR_URL = /^\/uploads\/avatars\/[0-9a-f-]{36}\.webp$/;

function uploadAvatar(
  token: string | null,
  file?: { buffer: Buffer; filename?: string; field?: string },
) {
  const req = request(app).put('/api/me/avatar');
  if (token !== null) req.set('Authorization', `Bearer ${token}`);
  if (file) req.attach(file.field ?? 'image', file.buffer, file.filename ?? 'avatar.png');
  return req;
}

async function getAvatarPath(userId: number) {
  const [row] = await db
    .select({ avatarPath: users.avatarPath })
    .from(users)
    .where(eq(users.id, userId));
  return row.avatarPath;
}

function expectValidationError(response: request.Response, message: string) {
  expect(response.status).toBe(400);
  expect(response.body).toEqual({ error: { code: 'VALIDATION_ERROR', message } });
}

describe('PUT /api/me/avatar', () => {
  beforeEach(async () => {
    await resetDatabase();
    await resetUploads();
  });

  afterAll(async () => {
    await resetUploads();
    await pool.end();
  });

  describe('success', () => {
    it('returns 200 with the Me format and the new avatarUrl', async () => {
      const { token, user } = await registerUser(app);

      const response = await uploadAvatar(token, { buffer: await makeImage() });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: expect.stringMatching(AVATAR_URL),
        createdAt: expect.any(String),
      });
      expect(new Date(response.body.createdAt).toISOString()).toBe(response.body.createdAt);
    });

    it('never exposes password or token', async () => {
      const { token } = await registerUser(app);

      const response = await uploadAvatar(token, { buffer: await makeImage() });

      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.body).not.toHaveProperty('token');
      expect(response.body).not.toHaveProperty('avatarPath');
    });

    it('saves the file with a server-generated UUID name, ignoring the original name', async () => {
      const { token } = await registerUser(app);

      const response = await uploadAvatar(token, {
        buffer: await makeImage(),
        filename: '../../evil name.png',
      });

      const files = await listUploads('avatars');
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(UUID_WEBP);
      expect(response.body.avatarUrl).toBe(`/uploads/avatars/${files[0]}`);
    });

    it('stores the relative path (not the URL) in the database', async () => {
      const { token, user } = await registerUser(app);

      const response = await uploadAvatar(token, { buffer: await makeImage() });

      const [file] = await listUploads('avatars');
      expect(await getAvatarPath(user.id)).toBe(`avatars/${file}`);
      expect(response.body.avatarUrl).toBe(`/uploads/avatars/${file}`);
    });

    it.each(['png', 'jpeg', 'webp'] as const)(
      'accepts %s and converts it to a 200x200 webp',
      async (format) => {
        const { token, user } = await registerUser(app);

        await uploadAvatar(token, {
          buffer: await makeImage({ format }),
          filename: `avatar.${format === 'jpeg' ? 'jpg' : format}`,
        });

        const meta = await readUploadMetadata((await getAvatarPath(user.id))!);
        expect(meta.format).toBe('webp');
        expect(meta.width).toBe(200);
        expect(meta.height).toBe(200);
      },
    );

    it.each([
      { width: 800, height: 400 },
      { width: 300, height: 900 },
      { width: 50, height: 50 },
    ])('resizes a $width x $height image to exactly 200x200', async ({ width, height }) => {
      const { token, user } = await registerUser(app);

      await uploadAvatar(token, { buffer: await makeImage({ width, height }) });

      const meta = await readUploadMetadata((await getAvatarPath(user.id))!);
      expect([meta.width, meta.height]).toEqual([200, 200]);
    });

    it('strips EXIF metadata from the stored image', async () => {
      const { token, user } = await registerUser(app);
      const withExif = await sharp(await makeImage({ format: 'jpeg' }))
        .withExif({ IFD0: { Copyright: 'secret-location' } })
        .jpeg()
        .toBuffer();
      expect((await sharp(withExif).metadata()).exif).toBeDefined();

      await uploadAvatar(token, { buffer: withExif, filename: 'photo.jpg' });

      const stored = await readFile(uploadPath((await getAvatarPath(user.id))!));
      expect((await sharp(stored).metadata()).exif).toBeUndefined();
      expect(stored.includes('secret-location')).toBe(false);
    });

    it('replaces the previous avatar and deletes the old file', async () => {
      const { token, user } = await registerUser(app);
      const first = await uploadAvatar(token, { buffer: await makeImage() });

      const second = await uploadAvatar(token, { buffer: await makeImage({ format: 'jpeg' }) });

      expect(second.status).toBe(200);
      expect(second.body.avatarUrl).not.toBe(first.body.avatarUrl);
      const files = await listUploads('avatars');
      expect(files).toHaveLength(1);
      expect(`avatars/${files[0]}`).toBe(await getAvatarPath(user.id));
    });

    it('only changes the authenticated user avatar', async () => {
      const john = await registerUser(app);
      const jane = await registerUser(app, { email: 'jane@example.com' });

      await uploadAvatar(john.token, { buffer: await makeImage() });

      expect(await getAvatarPath(jane.user.id)).toBeNull();
    });

    it('serves the stored image at avatarUrl', async () => {
      const { token } = await registerUser(app);
      const { body } = await uploadAvatar(token, { buffer: await makeImage() });

      const response = await request(app).get(body.avatarUrl).buffer(true);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/webp');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('validation', () => {
    it('returns 400 "Image is required" when no file is sent', async () => {
      const { token } = await registerUser(app);

      const response = await uploadAvatar(token).field('name', 'x');

      expectValidationError(response, 'Image is required');
    });

    it('returns 400 "Image is required" for a JSON body', async () => {
      const { token } = await registerUser(app);

      const response = await uploadAvatar(token).send({ image: 'not-a-file' });

      expectValidationError(response, 'Image is required');
    });

    it('returns 400 "Unexpected file field" when the file is not in the "image" field', async () => {
      const { token } = await registerUser(app);

      const response = await uploadAvatar(token, { buffer: await makeImage(), field: 'avatar' });

      expectValidationError(response, 'Unexpected file field');
    });

    it('returns 400 "Unexpected file field" when more than one file is sent', async () => {
      const { token } = await registerUser(app);
      const image = await makeImage();

      const response = await uploadAvatar(token, { buffer: image }).attach(
        'image',
        image,
        'second.png',
      );

      expectValidationError(response, 'Unexpected file field');
    });

    it('returns 400 "File too large" for files over 5 MB', async () => {
      const { token } = await registerUser(app);

      const response = await uploadAvatar(token, {
        buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
        filename: 'big.png',
      });

      expectValidationError(response, 'File too large');
    });

    it('returns 400 "Invalid image" for a non-image file disguised as png', async () => {
      const { token } = await registerUser(app);

      const response = await uploadAvatar(token, {
        buffer: Buffer.from('definitely not an image'),
        filename: 'fake.png',
      });

      expectValidationError(response, 'Invalid image');
    });

    it('returns 400 "Invalid image" for an unsupported format (gif)', async () => {
      const { token } = await registerUser(app);

      const response = await uploadAvatar(token, {
        buffer: await makeImage({ format: 'gif' }),
        filename: 'anim.gif',
      });

      expectValidationError(response, 'Invalid image');
    });

    it('returns 400 "Invalid image" for an unsupported format disguised with a png name', async () => {
      const { token } = await registerUser(app);

      const response = await uploadAvatar(token, {
        buffer: await makeImage({ format: 'gif' }),
        filename: 'looks-fine.png',
      });

      expectValidationError(response, 'Invalid image');
    });

    it('returns 400 "Invalid image" for an svg disguised as png', async () => {
      const { token } = await registerUser(app);
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
      );

      const response = await uploadAvatar(token, { buffer: svg, filename: 'vector.png' });

      expectValidationError(response, 'Invalid image');
    });

    it('returns 400 for a malformed multipart body', async () => {
      const { token } = await registerUser(app);

      const response = await request(app)
        .put('/api/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'multipart/form-data; boundary=xyz')
        .send('--xyz\r\nContent-Disposition: form-data; name="image"; filename="a.png"\r\n');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('keeps the previous avatar when the new upload is invalid', async () => {
      const { token, user } = await registerUser(app);
      await uploadAvatar(token, { buffer: await makeImage() });
      const before = await getAvatarPath(user.id);

      await uploadAvatar(token, { buffer: Buffer.from('nope'), filename: 'x.png' });

      expect(await getAvatarPath(user.id)).toBe(before);
      expect(await listUploads('avatars')).toEqual([before!.replace('avatars/', '')]);
    });

    it('writes nothing to disk when the upload is invalid', async () => {
      const { token, user } = await registerUser(app);

      await uploadAvatar(token, { buffer: Buffer.from('nope'), filename: 'x.png' });

      expect(await listUploads('avatars')).toEqual([]);
      expect(await getAvatarPath(user.id)).toBeNull();
    });
  });

  describe('authentication', () => {
    it('returns 401 without a token and writes nothing to disk', async () => {
      const response = await uploadAvatar(null, { buffer: await makeImage() });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(await listUploads('avatars')).toEqual([]);
    });

    it('returns 401 for an invalid token', async () => {
      const response = await uploadAvatar('a'.repeat(64), { buffer: await makeImage() });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('checks authentication before validating the upload', async () => {
      const response = await uploadAvatar(null, {
        buffer: Buffer.from('nope'),
        filename: 'x.png',
      });

      expect(response.status).toBe(401);
    });
  });
});
