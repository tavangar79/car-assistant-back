import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
export const ENCRYPTION_KEY_BYTES = 32;

/** AES-256-GCM with a random 12-byte IV. The blob is `iv(12) | authTag(16) | ciphertext`. */
export function encryptBytes(key: Uint8Array, plain: Uint8Array): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

/** Throws if the blob was tampered with or the key is wrong. */
export function decryptBytes(key: Uint8Array, blob: Uint8Array): Buffer {
  if (blob.byteLength < IV_BYTES + TAG_BYTES) throw new Error('Encrypted blob is too short');
  const bytes = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
  const decipher = createDecipheriv(ALGORITHM, key, bytes.subarray(0, IV_BYTES));
  decipher.setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
}
