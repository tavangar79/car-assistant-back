import type { FileStorage } from '../lib/file-storage.ts';

export class InMemoryFileStorage implements FileStorage {
  readonly files = new Map<string, { bytes: Buffer; contentType: string }>();
  /** Set to make every `delete` throw (a storage outage). */
  failDeletes = false;

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.files.set(key, { bytes: Buffer.from(bytes), contentType });
  }

  async get(key: string): Promise<Buffer | null> {
    return this.files.get(key)?.bytes ?? null;
  }

  async delete(key: string): Promise<void> {
    if (this.failDeletes) throw new Error('storage is down');
    this.files.delete(key);
  }

  /** The stored bytes, in insertion order. */
  contents(): Buffer[] {
    return [...this.files.values()].map((file) => file.bytes);
  }
}
