import { detectImageType, type ImageContentType } from './image-type.ts';

export const PDF_CONTENT_TYPE = 'application/pdf';
export type FileContentType = ImageContentType | typeof PDF_CONTENT_TYPE;

// "%PDF-"
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];

/** The file type from its magic bytes (a PDF or an image), or null if it isn't one of `allowed`. */
export function detectFileType(
  data: Uint8Array,
  allowed: readonly FileContentType[],
): FileContentType | null {
  if (PDF_MAGIC.every((byte, i) => data[i] === byte)) {
    return allowed.includes(PDF_CONTENT_TYPE) ? PDF_CONTENT_TYPE : null;
  }
  const images = allowed.filter((type): type is ImageContentType => type !== PDF_CONTENT_TYPE);
  return detectImageType(data, images);
}
