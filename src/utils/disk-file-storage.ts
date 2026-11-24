import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FileStorage } from './file-storage.ts';

/** Adapter de disco local: grava em `<root>/<dir>/<uuid>.<ext>`. */
export class DiskFileStorage implements FileStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  async save(dir: string, content: Buffer, extension: string) {
    // Nome sempre gerado aqui: o nome original do cliente é descartado (path traversal, colisão).
    const relativePath = path.posix.join(dir, `${randomUUID()}.${extension}`);
    const absolutePath = this.resolveInsideRoot(relativePath);

    await mkdir(path.dirname(absolutePath), { recursive: true });
    // `wx` falha se o arquivo já existir, em vez de sobrescrever outro upload.
    await writeFile(absolutePath, content, { flag: 'wx' });

    // Persistido com `/` mesmo no Windows, para o caminho no banco ser portável.
    return relativePath;
  }

  async delete(relativePath: string) {
    await rm(this.resolveInsideRoot(relativePath), { force: true });
  }

  /** Impede que um caminho vindo do banco (ou de um bug) leia/apague fora da raiz de uploads. */
  private resolveInsideRoot(relativePath: string) {
    const absolutePath = path.resolve(this.root, relativePath);
    if (!absolutePath.startsWith(this.root + path.sep)) {
      throw new Error('Path escapes the upload directory');
    }
    return absolutePath;
  }
}
