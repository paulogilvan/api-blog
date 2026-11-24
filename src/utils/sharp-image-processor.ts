import sharp from 'sharp';
import { AppError } from '../errors/app-error.ts';
import type { ImagePreset, ImageProcessor } from './image-processor.ts';

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);

// Limita a área decodificada (~ 40 MP) para barrar "decompression bombs": um arquivo pequeno
// que declara dimensões gigantes e estoura a memória ao ser decodificado.
const MAX_INPUT_PIXELS = 40_000_000;

const AVATAR_SIZE = 200;

// Imagem do post limitada a 720p: cabe numa caixa de 1280x720 (paisagem até 1280 de largura,
// retrato até 720 de altura), mantendo a proporção.
const POST_MAX_WIDTH = 1280;
const POST_MAX_HEIGHT = 720;

const invalidImage = () => new AppError('VALIDATION_ERROR', 'Invalid image');

/** Adapter Sharp: valida o formato real pelos bytes e re-encoda para WebP sem metadados. */
export class SharpImageProcessor implements ImageProcessor {
  async process(image: Buffer, preset: ImagePreset) {
    // O formato vem da decodificação, não do mimetype/extensão enviados pelo cliente.
    // Restringir aqui também evita passar SVG (renderizado pelo librsvg), GIF, TIFF etc. adiante.
    const format = await sharp(image, { limitInputPixels: MAX_INPUT_PIXELS })
      .metadata()
      .then((meta) => meta.format)
      .catch(() => {
        throw invalidImage();
      });
    if (!format || !ACCEPTED_FORMATS.has(format)) throw invalidImage();

    const pipeline = sharp(image, { limitInputPixels: MAX_INPUT_PIXELS })
      // Aplica a orientação EXIF antes de descartar os metadados.
      .rotate();

    switch (preset) {
      case 'avatar':
        // `cover` recorta o centro e amplia imagens menores: o avatar sai sempre 200x200.
        pipeline.resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' });
        break;
      case 'post':
        // `inside` só reduz até caber na caixa; `withoutEnlargement` não amplia imagens menores.
        pipeline.resize(POST_MAX_WIDTH, POST_MAX_HEIGHT, {
          fit: 'inside',
          withoutEnlargement: true,
        });
        break;
    }

    // O re-encode sem `.withMetadata()` descarta EXIF/GPS/ICC do original.
    return pipeline
      .webp({ quality: 80 })
      .toBuffer()
      .catch(() => {
        // Arquivo truncado/corrompido costuma passar no `metadata()` e só falhar ao decodificar.
        throw invalidImage();
      });
  }
}
