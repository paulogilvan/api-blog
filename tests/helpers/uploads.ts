import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Diretório de uploads dos testes (vem do .env.test, carregado pelo vitest.config).
export const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? 'tmp/uploads-test');

/** Apaga tudo o que os testes gravaram em disco. */
export async function resetUploads() {
  await rm(uploadDir, { recursive: true, force: true });
}

/** Lista os arquivos de uma subpasta de uploads (vazia se a pasta não existir). */
export async function listUploads(dir: string): Promise<string[]> {
  try {
    return await readdir(path.join(uploadDir, dir));
  } catch {
    return [];
  }
}

export function uploadPath(relativePath: string) {
  return path.join(uploadDir, relativePath);
}

/**
 * Metadados de um arquivo gravado. Lê para um buffer antes de entregar ao Sharp: abrir pelo
 * caminho deixa o arquivo preso no cache do libvips, e no Windows o `rm` seguinte falha (EBUSY).
 */
export async function readUploadMetadata(relativePath: string) {
  return sharp(await readFile(uploadPath(relativePath))).metadata();
}

type ImageFormat = 'png' | 'jpeg' | 'webp' | 'gif';

/** Gera uma imagem válida em memória (sem fixtures binárias no repositório). */
export function makeImage({
  width = 400,
  height = 400,
  format = 'png',
}: { width?: number; height?: number; format?: ImageFormat } = {}) {
  return sharp({ create: { width, height, channels: 3, background: '#3366cc' } })
    .toFormat(format)
    .toBuffer();
}
