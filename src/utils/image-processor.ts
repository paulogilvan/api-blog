/** Presets de processamento; as dimensões ficam no adapter, nunca vêm do request. */
export type ImagePreset = 'avatar';

/**
 * Abstração de processamento de imagem. Recebe os bytes enviados pelo cliente e devolve a imagem
 * final (WebP, redimensionada, sem metadados). Lança `AppError('VALIDATION_ERROR', 'Invalid image')`
 * se os bytes não forem uma imagem JPEG/PNG/WebP decodificável.
 */
export interface ImageProcessor {
  process(image: Buffer, preset: ImagePreset): Promise<Buffer>;
}
