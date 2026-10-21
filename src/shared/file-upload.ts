import type { RequestHandler } from 'express';
import multer from 'multer';
import { AppError, ValidationError } from './errors.ts';

export interface FileUploadOptions {
  /** Multipart field that carries the file. */
  field: string;
  maxBytes: number;
  /** Declared MIME types accepted up front; the service still checks the magic bytes. */
  contentTypes: readonly string[];
  /** Validation message for a disallowed type. */
  badTypeMessage: string;
}

/**
 * Maps upload errors to API errors: too large → 413, other multer limits → 400, and a body
 * busboy can't parse → 400 instead of 500. Our own errors (from `fileFilter`) pass through.
 */
function toAppError(err: unknown, field: string): unknown {
  if (!err || err instanceof AppError) return err;
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return new AppError(413, 'File too large');
    return new ValidationError({ [field]: [err.message] });
  }
  return new ValidationError({ [field]: ['Malformed multipart body'] });
}

/** Reads one file from multipart/form-data into memory (`req.file`), allow-listed by declared type and size. */
export function fileUpload({
  field,
  maxBytes,
  contentTypes,
  badTypeMessage,
}: FileUploadOptions): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    // Browsers send non-ASCII file names as UTF-8; multer's default (latin1) would garble Persian names.
    defParamCharset: 'utf8',
    fileFilter: (_req, file, accept) => {
      if (contentTypes.includes(file.mimetype)) accept(null, true);
      else accept(new ValidationError({ [field]: [badTypeMessage] }));
    },
  }).single(field);

  return (req, res, next) => {
    upload(req, res, (err?: unknown) => next(toAppError(err, field)));
  };
}
