export const IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number];

function startsWith(data: Uint8Array, bytes: number[], offset = 0): boolean {
  return bytes.every((byte, i) => data[offset + i] === byte);
}

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

function sniff(data: Uint8Array): ImageContentType | null {
  if (startsWith(data, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(data, ascii('RIFF')) && startsWith(data, ascii('WEBP'), 8)) return 'image/webp';
  return null;
}

/**
 * The image type from the file's magic bytes, or null if it isn't one of `allowed`
 * (JPEG, PNG or WebP by default).
 */
export function detectImageType(
  data: Uint8Array,
  allowed: readonly ImageContentType[] = IMAGE_CONTENT_TYPES,
): ImageContentType | null {
  const type = sniff(data);
  return type && allowed.includes(type) ? type : null;
}
