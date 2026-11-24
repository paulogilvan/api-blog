import type { RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { AppError } from '../errors/app-error.ts';

// Único arquivo do projeto que conhece o Multer. Controllers leem só `req.file?.buffer`.

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

// Filtro barato pelo mimetype declarado pelo cliente (não confiável): a validação real é o
// Sharp decodificar os bytes no ImageProcessor.
const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const imageUpload = multer({
  // Em memória: o Multer nunca grava em disco; quem grava é o FileStorage, após o processamento.
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1, fields: 10, fieldSize: 1024, parts: 20 },
  fileFilter: (_req, file, callback) => {
    if (ACCEPTED_MIME_TYPES.has(file.mimetype)) callback(null, true);
    else callback(new AppError('VALIDATION_ERROR', 'Invalid image'));
  },
});

function toUploadError(error: unknown): unknown {
  if (error instanceof AppError) return error;

  if (error instanceof MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return new AppError('VALIDATION_ERROR', 'File too large');
      case 'LIMIT_UNEXPECTED_FILE':
      case 'LIMIT_FILE_COUNT':
        return new AppError('VALIDATION_ERROR', 'Unexpected file field');
      default:
        return new AppError('VALIDATION_ERROR', 'Invalid multipart body');
    }
  }

  // Erros do parser (busboy) com corpo multipart truncado/malformado.
  return new AppError('VALIDATION_ERROR', 'Invalid multipart body');
}

/** Recebe no máximo um arquivo de imagem no campo `image` (multipart/form-data). */
export function singleImage(field = 'image'): RequestHandler {
  const handler = imageUpload.single(field);
  return (req, res, next) => {
    handler(req, res, (error?: unknown) => next(error ? toUploadError(error) : undefined));
  };
}
