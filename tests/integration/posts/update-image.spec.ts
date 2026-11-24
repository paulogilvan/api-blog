import { readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.ts';
import { db, pool } from '../../../src/db/index.ts';
import { posts } from '../../../src/db/schema.ts';
import { createPost, createReply, likePost, registerUser } from '../../helpers/api.ts';
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
const IMAGE_URL = /^\/uploads\/posts\/[0-9a-f-]{36}\.webp$/;

function uploadPostImage(
  token: string | null,
  postId: number | string,
  file?: { buffer: Buffer; filename?: string; field?: string },
) {
  const req = request(app).put(`/api/posts/${postId}/image`);
  if (token !== null) req.set('Authorization', `Bearer ${token}`);
  if (file) req.attach(file.field ?? 'image', file.buffer, file.filename ?? 'photo.png');
  return req;
}

async function getImagePath(postId: number) {
  const [row] = await db
    .select({ imagePath: posts.imagePath })
    .from(posts)
    .where(eq(posts.id, postId));
  return row.imagePath;
}

function expectValidationError(response: request.Response, message: string) {
  expect(response.status).toBe(400);
  expect(response.body).toEqual({ error: { code: 'VALIDATION_ERROR', message } });
}

describe('PUT /api/posts/:id/image', () => {
  beforeEach(async () => {
    await resetDatabase();
    await resetUploads();
  });

  afterAll(async () => {
    await resetUploads();
    await pool.end();
  });

  describe('success', () => {
    it('returns 200 with the PostSummary and the new imageUrl', async () => {
      const { token, user } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await uploadPostImage(token, post.id, { buffer: await makeImage() });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: post.id,
        title: post.title,
        content: post.content,
        imageUrl: expect.stringMatching(IMAGE_URL),
        createdAt: post.createdAt,
        author: { id: user.id, name: user.name },
        likesCount: 0,
        repliesCount: 0,
      });
    });

    it('returns the current likesCount and repliesCount of the post', async () => {
      const { token } = await registerUser(app);
      const fan = await registerUser(app, { email: 'fan@example.com' });
      const post = await createPost(app, token);
      await likePost(app, fan.token, post.id);
      await createReply(app, fan.token, post.id);

      const response = await uploadPostImage(token, post.id, { buffer: await makeImage() });

      expect(response.body.likesCount).toBe(1);
      expect(response.body.repliesCount).toBe(1);
    });

    it('saves the file under posts/ with a server-generated UUID name', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await uploadPostImage(token, post.id, {
        buffer: await makeImage(),
        filename: '../../evil name.png',
      });

      const files = await listUploads('posts');
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(UUID_WEBP);
      expect(response.body.imageUrl).toBe(`/uploads/posts/${files[0]}`);
    });

    it('stores the relative path (not the URL) in the database', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      await uploadPostImage(token, post.id, { buffer: await makeImage() });

      const [file] = await listUploads('posts');
      expect(await getImagePath(post.id)).toBe(`posts/${file}`);
    });

    it.each(['png', 'jpeg', 'webp'] as const)('accepts %s and converts it to webp', async (format) => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await uploadPostImage(token, post.id, {
        buffer: await makeImage({ format }),
        filename: `photo.${format === 'jpeg' ? 'jpg' : format}`,
      });

      expect(response.status).toBe(200);
      const meta = await readUploadMetadata((await getImagePath(post.id))!);
      expect(meta.format).toBe('webp');
    });

    // Limite de 720p: a imagem cabe numa caixa de 1280x720, mantendo a proporção.
    it.each([
      { input: [2560, 1440], output: [1280, 720], label: 'a 16:9 landscape larger than 720p' },
      { input: [1000, 2000], output: [360, 720], label: 'a portrait taller than 720 px' },
      { input: [3000, 1000], output: [1280, 427], label: 'a panorama wider than 1280 px' },
      { input: [1920, 1920], output: [720, 720], label: 'a large square' },
    ])('scales down $label to fit 1280x720', async ({ input, output }) => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      await uploadPostImage(token, post.id, {
        buffer: await makeImage({ width: input[0], height: input[1] }),
      });

      const meta = await readUploadMetadata((await getImagePath(post.id))!);
      expect([meta.width, meta.height]).toEqual(output);
    });

    it.each([
      [800, 600],
      [1280, 720],
      [50, 30],
    ])('keeps the original size of a %i x %i image (no enlargement)', async (width, height) => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      await uploadPostImage(token, post.id, { buffer: await makeImage({ width, height }) });

      const meta = await readUploadMetadata((await getImagePath(post.id))!);
      expect([meta.width, meta.height]).toEqual([width, height]);
    });

    it('strips EXIF metadata from the stored image', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      const withExif = await sharp(await makeImage({ format: 'jpeg' }))
        .withExif({ IFD0: { Copyright: 'secret-location' } })
        .jpeg()
        .toBuffer();

      await uploadPostImage(token, post.id, { buffer: withExif, filename: 'photo.jpg' });

      const stored = await readFile(uploadPath((await getImagePath(post.id))!));
      expect((await sharp(stored).metadata()).exif).toBeUndefined();
      expect(stored.includes('secret-location')).toBe(false);
    });

    it('replaces the previous image and deletes the old file', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      const first = await uploadPostImage(token, post.id, { buffer: await makeImage() });

      const second = await uploadPostImage(token, post.id, {
        buffer: await makeImage({ format: 'jpeg' }),
      });

      expect(second.status).toBe(200);
      expect(second.body.imageUrl).not.toBe(first.body.imageUrl);
      const files = await listUploads('posts');
      expect(files).toHaveLength(1);
      expect(`posts/${files[0]}`).toBe(await getImagePath(post.id));
    });

    it('only changes the target post', async () => {
      const { token } = await registerUser(app);
      const target = await createPost(app, token);
      const other = await createPost(app, token);

      await uploadPostImage(token, target.id, { buffer: await makeImage() });

      expect(await getImagePath(other.id)).toBeNull();
    });

    it('serves the stored image at imageUrl', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      const { body } = await uploadPostImage(token, post.id, { buffer: await makeImage() });

      const response = await request(app).get(body.imageUrl).buffer(true);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/webp');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('exposes imageUrl in GET /posts/:id and in the listing', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      const { body } = await uploadPostImage(token, post.id, { buffer: await makeImage() });

      const detail = await request(app).get(`/api/posts/${post.id}`);
      const list = await request(app).get('/api/posts');

      expect(detail.body.imageUrl).toBe(body.imageUrl);
      expect(list.body.data[0].imageUrl).toBe(body.imageUrl);
    });

    it('keeps the image when the post title/content is updated', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      const { body } = await uploadPostImage(token, post.id, { buffer: await makeImage() });

      const response = await request(app)
        .put(`/api/posts/${post.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'New title' });

      expect(response.body.imageUrl).toBe(body.imageUrl);
    });
  });

  describe('validation', () => {
    it('returns 400 "Image is required" when no file is sent', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await uploadPostImage(token, post.id).field('title', 'x');

      expectValidationError(response, 'Image is required');
    });

    it('returns 400 "Image is required" for a JSON body', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await uploadPostImage(token, post.id).send({ image: 'not-a-file' });

      expectValidationError(response, 'Image is required');
    });

    it('returns 400 "Unexpected file field" when the file is not in the "image" field', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await uploadPostImage(token, post.id, {
        buffer: await makeImage(),
        field: 'photo',
      });

      expectValidationError(response, 'Unexpected file field');
    });

    it('returns 400 "Unexpected file field" when more than one file is sent', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      const image = await makeImage();

      const response = await uploadPostImage(token, post.id, { buffer: image }).attach(
        'image',
        image,
        'second.png',
      );

      expectValidationError(response, 'Unexpected file field');
    });

    it('returns 400 "File too large" for files over 5 MB', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await uploadPostImage(token, post.id, {
        buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
        filename: 'big.png',
      });

      expectValidationError(response, 'File too large');
    });

    it('returns 400 "Invalid image" for a non-image file disguised as png', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await uploadPostImage(token, post.id, {
        buffer: Buffer.from('definitely not an image'),
        filename: 'fake.png',
      });

      expectValidationError(response, 'Invalid image');
    });

    it('returns 400 "Invalid image" for an unsupported format (gif)', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await uploadPostImage(token, post.id, {
        buffer: await makeImage({ format: 'gif' }),
        filename: 'looks-fine.png',
      });

      expectValidationError(response, 'Invalid image');
    });

    it.each(['0', '01', '-1', '1.5', '0x10', 'abc', '2147483648'])(
      'returns 400 for invalid id "%s"',
      async (id) => {
        const { token } = await registerUser(app);

        const response = await uploadPostImage(token, id, { buffer: await makeImage() });

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      },
    );

    it('keeps the previous image when the new upload is invalid', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);
      await uploadPostImage(token, post.id, { buffer: await makeImage() });
      const before = await getImagePath(post.id);

      await uploadPostImage(token, post.id, { buffer: Buffer.from('nope'), filename: 'x.png' });

      expect(await getImagePath(post.id)).toBe(before);
      expect(await listUploads('posts')).toEqual([before!.replace('posts/', '')]);
    });

    it('writes nothing to disk when the upload is invalid', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      await uploadPostImage(token, post.id, { buffer: Buffer.from('nope'), filename: 'x.png' });

      expect(await listUploads('posts')).toEqual([]);
      expect(await getImagePath(post.id)).toBeNull();
    });
  });

  describe('authentication and ownership', () => {
    it('returns 401 without a token and writes nothing to disk', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await uploadPostImage(null, post.id, { buffer: await makeImage() });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(await listUploads('posts')).toEqual([]);
    });

    it('returns 401 for an invalid token', async () => {
      const { token } = await registerUser(app);
      const post = await createPost(app, token);

      const response = await uploadPostImage('a'.repeat(64), post.id, {
        buffer: await makeImage(),
      });

      expect(response.status).toBe(401);
    });

    it('returns 404 for a post that does not exist and writes nothing to disk', async () => {
      const { token } = await registerUser(app);

      const response = await uploadPostImage(token, 999, { buffer: await makeImage() });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Post not found' } });
      expect(await listUploads('posts')).toEqual([]);
    });

    it('returns 403 when the post belongs to another user and keeps it unchanged', async () => {
      const owner = await registerUser(app);
      const intruder = await registerUser(app, { email: 'intruder@example.com' });
      const post = await createPost(app, owner.token);

      const response = await uploadPostImage(intruder.token, post.id, {
        buffer: await makeImage(),
      });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: { code: 'FORBIDDEN', message: 'You can only update your own posts' },
      });
      expect(await getImagePath(post.id)).toBeNull();
      expect(await listUploads('posts')).toEqual([]);
    });

    it('checks existence (404) before decoding the image', async () => {
      const { token } = await registerUser(app);

      const response = await uploadPostImage(token, 999, {
        buffer: Buffer.from('nope'),
        filename: 'x.png',
      });

      expect(response.status).toBe(404);
    });

    it('checks ownership (403) before decoding the image', async () => {
      const owner = await registerUser(app);
      const intruder = await registerUser(app, { email: 'intruder@example.com' });
      const post = await createPost(app, owner.token);

      const response = await uploadPostImage(intruder.token, post.id, {
        buffer: Buffer.from('nope'),
        filename: 'x.png',
      });

      expect(response.status).toBe(403);
    });

    it('checks the id (400) before existence', async () => {
      const { token } = await registerUser(app);

      const response = await uploadPostImage(token, '0', {
        buffer: Buffer.from('nope'),
        filename: 'x.png',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.message).not.toBe('Invalid image');
    });
  });
});
