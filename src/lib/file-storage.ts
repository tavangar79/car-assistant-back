import { randomBytes } from 'node:crypto';

/**
 * Where uploaded file bytes live (never in MongoDB). Keys are always built by `newStorageKey`, never
 * from a client-supplied name. Today: `LocalFileStorage` (a folder); later an S3-compatible bucket.
 */
export interface FileStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** The bytes, or null when nothing is stored under the key. */
  get(key: string): Promise<Buffer | null>;
  /** Safe to repeat: deleting a missing key succeeds. */
  delete(key: string): Promise<void>;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/**
 * `<folder>/<random>.<ext>`, e.g. `avatars/<userId>/<32 hex>.png`. A new key per upload, so a
 * replaced file never overwrites the one a concurrent request may still be reading.
 */
export function newStorageKey(folder: string, contentType: string): string {
  return `${folder}/${randomBytes(16).toString('hex')}.${EXTENSIONS[contentType] ?? 'bin'}`;
}

/**
 * Writes the file, then runs `save` (the DB write). If `save` fails the new file is removed again,
 * so a failed request leaves nothing behind.
 */
export async function putThenSave<T>(
  storage: FileStorage,
  file: { key: string; bytes: Uint8Array; contentType: string },
  save: () => Promise<T>,
): Promise<T> {
  await storage.put(file.key, file.bytes, file.contentType);
  try {
    return await save();
  } catch (error) {
    await deleteFilesQuietly(storage, [file.key]);
    throw error;
  }
}

/**
 * Deletes files whose DB rows are already gone. A failure is logged, never thrown: the request has
 * succeeded, and the file is only an orphan on disk.
 */
export async function deleteFilesQuietly(
  storage: FileStorage,
  keys: readonly (string | null | undefined)[],
): Promise<void> {
  for (const key of keys) {
    if (!key) continue;
    try {
      await storage.delete(key);
    } catch (error) {
      console.error(`[files] could not delete ${key}:`, error);
    }
  }
}
