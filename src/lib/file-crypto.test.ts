import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptBytes, encryptBytes } from './file-crypto.ts';

const KEY = randomBytes(32);
const PLAIN = Buffer.from('%PDF-1.4 بیمه‌نامه');

describe('file-crypto', () => {
  it('round-trips the bytes', () => {
    expect(decryptBytes(KEY, encryptBytes(KEY, PLAIN))).toEqual(PLAIN);
  });

  it('round-trips empty bytes', () => {
    expect(decryptBytes(KEY, encryptBytes(KEY, Buffer.alloc(0)))).toEqual(Buffer.alloc(0));
  });

  it('stores iv | tag | ciphertext, never the plaintext', () => {
    const blob = encryptBytes(KEY, PLAIN);

    expect(blob.byteLength).toBe(12 + 16 + PLAIN.byteLength);
    expect(blob.includes(PLAIN)).toBe(false);
  });

  it('uses a fresh IV each time', () => {
    expect(encryptBytes(KEY, PLAIN)).not.toEqual(encryptBytes(KEY, PLAIN));
  });

  it('throws for a tampered blob', () => {
    const blob = encryptBytes(KEY, PLAIN);
    blob.writeUInt8(blob.readUInt8(blob.length - 1) ^ 0xff, blob.length - 1);

    expect(() => decryptBytes(KEY, blob)).toThrow();
  });

  it('throws for a wrong key', () => {
    expect(() => decryptBytes(randomBytes(32), encryptBytes(KEY, PLAIN))).toThrow();
  });

  it('throws for a truncated blob', () => {
    expect(() => decryptBytes(KEY, Buffer.alloc(10))).toThrow(/too short/);
  });
});
