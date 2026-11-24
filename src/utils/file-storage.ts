/** Abstração de armazenamento de arquivos. Os caminhos são sempre relativos à raiz de uploads. */
export interface FileStorage {
  /** Grava o conteúdo com nome gerado pelo servidor e retorna o caminho relativo (ex.: `avatars/<uuid>.webp`). */
  save(dir: string, content: Buffer, extension: string): Promise<string>;
  /** Apaga o arquivo; idempotente (arquivo inexistente não é erro). */
  delete(relativePath: string): Promise<void>;
}
