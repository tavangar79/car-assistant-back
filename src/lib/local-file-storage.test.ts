import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FileStorage } from './file-storage.ts';
import { LocalFileStorage } from './local-file-storage.ts';

describe('LocalFileStorage', () => {
  let root: string;
  let storage: FileStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'uploads-'));
    storage = new LocalFileStorage(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('writes the bytes under the root, creating folders, and reads them back', async () => {
    await storage.put('avatars/u1/a.png', Buffer.from([1, 2, 3]), 'image/png');

    expect(await readFile(join(root, 'avatars', 'u1', 'a.png'))).toEqual(Buffer.from([1, 2, 3]));
    expect(await storage.get('avatars/u1/a.png')).toEqual(Buffer.from([1, 2, 3]));
  });

  it('overwrites an existing key', async () => {
    await storage.put('k/a.bin', Buffer.from([1]), 'application/octet-stream');
    await storage.put('k/a.bin', Buffer.from([2]), 'application/octet-stream');

    expect(await storage.get('k/a.bin')).toEqual(Buffer.from([2]));
  });

  it('returns null for a missing key', async () => {
    expect(await storage.get('avatars/nope.png')).toBeNull();
  });

  it('deletes, and deleting again (or a missing key) still succeeds', async () => {
    await storage.put('k/a.bin', Buffer.from([1]), 'application/octet-stream');

    await storage.delete('k/a.bin');
    await storage.delete('k/a.bin');

    expect(await storage.get('k/a.bin')).toBeNull();
  });

  it.each(['../outside.txt', 'a/../../outside.txt', '/etc/passwd', 'C:\\Windows\\x', '', '.'])(
    'rejects the key %j, which is not inside the root',
    async (key) => {
      await expect(storage.put(key, Buffer.from([1]), 'text/plain')).rejects.toThrow(/escapes/);
      await expect(storage.get(key)).rejects.toThrow(/escapes/);
      await expect(storage.delete(key)).rejects.toThrow(/escapes/);
    },
  );
});
