/** Prefixo público em que `UPLOAD_DIR` é servido (ver `app.ts`). */
export const UPLOADS_PUBLIC_PATH = '/uploads';

/** Converte o caminho relativo salvo no banco na URL pública; `null` quando não há arquivo. */
export function toUploadUrl(relativePath: string | null): string | null {
  return relativePath ? `${UPLOADS_PUBLIC_PATH}/${relativePath}` : null;
}
