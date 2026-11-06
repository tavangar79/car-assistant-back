import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type { FileStorage } from './file-storage.ts';

/** Files in a folder on disk (`UPLOAD_DIR`). The content type is not stored; the DB row keeps it. */
export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathOf(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  /** Throws for a key that would resolve outside the root (`..`, absolute paths, the root itself). */
  private pathOf(key: string): string {
    const path = resolve(this.root, key);
    const inside = relative(this.root, path);
    if (!key || !inside || inside.startsWith('..') || isAbsolute(inside)) {
      throw new Error(`Storage key escapes the upload folder: ${key}`);
    }
    return path;
  }
}
