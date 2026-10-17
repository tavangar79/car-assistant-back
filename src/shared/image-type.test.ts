import { describe, expect, it } from 'vitest';
import { JPEG_BYTES, PNG_BYTES, WEBP_BYTES } from '../test/image-fixtures.ts';
import { detectImageType } from './image-type.ts';

describe('detectImageType', () => {
  it.each([
    ['image/jpeg', JPEG_BYTES],
    ['image/png', PNG_BYTES],
    ['image/webp', WEBP_BYTES],
  ])('detects %s', (type, bytes) => {
    expect(detectImageType(bytes)).toBe(type);
  });

  it.each([
    ['text', Buffer.from('hello world, not an image')],
    ['GIF', Buffer.from('GIF89a......')],
    ['RIFF that is not WebP', Buffer.from('RIFF\x00\x00\x00\x00WAVE')],
    ['empty', Buffer.alloc(0)],
  ])('rejects %s', (_case, bytes) => {
    expect(detectImageType(bytes)).toBeNull();
  });

  it('rejects a real image whose type is not in the allowed list', () => {
    expect(detectImageType(WEBP_BYTES, ['image/jpeg', 'image/png'])).toBeNull();
    expect(detectImageType(PNG_BYTES, ['image/jpeg', 'image/png'])).toBe('image/png');
  });
});
