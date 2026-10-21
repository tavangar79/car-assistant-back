import type { RequestHandler } from 'express';
import { fileUpload, type FileUploadOptions } from './file-upload.ts';
import type { ImageContentType } from './image-type.ts';

export interface ImageUploadOptions extends Omit<FileUploadOptions, 'contentTypes'> {
  /** Declared image types accepted up front; the service still checks the magic bytes. */
  contentTypes: readonly ImageContentType[];
}

/** Reads one image file from multipart/form-data into memory (`req.file`). */
export function imageUpload(options: ImageUploadOptions): RequestHandler {
  return fileUpload(options);
}
