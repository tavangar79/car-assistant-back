import type { RequestHandler } from 'express';
import { IMAGE_CONTENT_TYPES } from '../../shared/image-type.ts';
import { imageUpload } from '../../shared/image-upload.ts';

export const AVATAR_FIELD = 'avatar';
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_CONTENT_TYPES = IMAGE_CONTENT_TYPES;
export const AVATAR_BAD_TYPE = 'Must be a JPEG, PNG or WebP image';

/** Reads one `avatar` file from multipart/form-data into memory (`req.file`). */
export function avatarUpload(maxBytes: number): RequestHandler {
  return imageUpload({
    field: AVATAR_FIELD,
    maxBytes,
    contentTypes: AVATAR_CONTENT_TYPES,
    badTypeMessage: AVATAR_BAD_TYPE,
  });
}
