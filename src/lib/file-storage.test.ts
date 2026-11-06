import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryFileStorage } from '../test/in-memory-file-storage.ts';
import { deleteFilesQuietly, newStorageKey, putThenSave } from './file-storage.ts';

const FILE = { key: 'avatars/u1/a.png', bytes: Buffer.from([1, 2]), contentType: 'image/png' };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('newStorageKey', () => {
  it('is <folder>/<32 hex>.<ext from the content type>', () => {
    expect(newStorageKey('avatars/u1', 'image/png')).toMatch(/^avatars\/u1\/[a-f\d]{32}\.png$/);
    expect(newStorageKey('x', 'application/pdf')).toMatch(/\.pdf$/);
    expect(newStorageKey('x', 'image/jpeg')).toMatch(/\.jpg$/);
    expect(newStorageKey('x', 'application/octet-stream')).toMatch(/\.bin$/);
  });

  it('is new on every call', () => {
    expect(newStorageKey('x', 'image/png')).not.toBe(newStorageKey('x', 'image/png'));
  });
});

describe('putThenSave', () => {
  it('writes the file before saving and returns what save returns', async () => {
    const storage = new InMemoryFileStorage();
    let storedWhenSaving = false;

    const result = await putThenSave(storage, FILE, async () => {
      storedWhenSaving = storage.files.has(FILE.key);
      return 'row';
    });

    expect(result).toBe('row');
    expect(storedWhenSaving).toBe(true);
    expect(storage.files.get(FILE.key)).toEqual({ bytes: FILE.bytes, contentType: 'image/png' });
  });

  it('removes the new file and rethrows when save fails', async () => {
    const storage = new InMemoryFileStorage();

    await expect(
      putThenSave(storage, FILE, async () => {
        throw new Error('db down');
      }),
    ).rejects.toThrow('db down');
    expect(storage.files.size).toBe(0);
  });
});

describe('deleteFilesQuietly', () => {
  it('deletes every key and skips empty ones', async () => {
    const storage = new InMemoryFileStorage();
    await storage.put('a', Buffer.from([1]), 'x');
    await storage.put('b', Buffer.from([1]), 'x');

    await deleteFilesQuietly(storage, ['a', null, undefined, 'b']);

    expect(storage.files.size).toBe(0);
  });

  it('logs a failed delete instead of throwing', async () => {
    const storage = new InMemoryFileStorage();
    storage.failDeletes = true;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(deleteFilesQuietly(storage, ['a'])).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith('[files] could not delete a:', expect.any(Error));
  });
});
