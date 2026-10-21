import { describe, expect, it } from 'vitest';
import { JPEG_BYTES, PDF_BYTES, PNG_BYTES, WEBP_BYTES } from '../test/image-fixtures.ts';
import { detectFileType } from './file-type.ts';

const PDF_OR_IMAGE = ['application/pdf', 'image/jpeg', 'image/png'] as const;

describe('detectFileType', () => {
  it.each([
    ['application/pdf', PDF_BYTES],
    ['image/jpeg', JPEG_BYTES],
    ['image/png', PNG_BYTES],
  ])('detects %s', (type, bytes) => {
    expect(detectFileType(bytes, PDF_OR_IMAGE)).toBe(type);
  });

  it('rejects an allowed-looking file whose type is not in the list', () => {
    expect(detectFileType(WEBP_BYTES, PDF_OR_IMAGE)).toBeNull();
    expect(detectFileType(PDF_BYTES, ['image/jpeg', 'image/png'])).toBeNull();
  });

  it.each([
    ['text', Buffer.from('%PDX-not a pdf')],
    ['empty', Buffer.alloc(0)],
  ])('rejects %s', (_case, bytes) => {
    expect(detectFileType(bytes, PDF_OR_IMAGE)).toBeNull();
  });
});
