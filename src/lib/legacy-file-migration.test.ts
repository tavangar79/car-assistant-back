import { describe, expect, it } from 'vitest';
import { InMemoryFileStorage } from '../test/in-memory-file-storage.ts';
import {
  LEGACY_FILE_COLLECTIONS,
  legacyStorageKey,
  migrateLegacyFiles,
  type LegacyFileCollection,
  type LegacyFileRow,
  type LegacyFileSource,
} from './legacy-file-migration.ts';

interface FakeDocument extends LegacyFileRow {
  storageKey?: string;
  hasData: boolean;
}

/** Collections of documents; `markMoved` drops `data` like `$unset` does. */
class FakeSource implements LegacyFileSource {
  constructor(readonly docs: Record<string, FakeDocument[]>) {}
  /** Set to keep `data` after a move (a broken update). */
  ignoreUnset = false;

  async findWithData(entry: LegacyFileCollection, limit: number): Promise<LegacyFileRow[]> {
    return (this.docs[entry.collection] ?? []).filter((doc) => doc.hasData).slice(0, limit);
  }

  async markMoved(
    entry: LegacyFileCollection,
    id: string,
    fields: { storageKey: string; sizeBytes: number },
  ): Promise<void> {
    const doc = this.docs[entry.collection]!.find((d) => d.id === id)!;
    Object.assign(doc, fields);
    if (!this.ignoreUnset) doc.hasData = false;
  }
}

const doc = (id: string, overrides: Partial<FakeDocument> = {}): FakeDocument => ({
  id,
  ownerId: `owner-${id}`,
  contentType: 'image/png',
  data: Buffer.from([1, 2, 3]),
  sizeBytes: null,
  hasData: true,
  ...overrides,
});

const entry = (name: string) => LEGACY_FILE_COLLECTIONS.find((e) => e.collection === name)!;

describe('migrateLegacyFiles', () => {
  it('writes each file to storage, records key + size and drops data', async () => {
    const source = new FakeSource({ user_avatars: [doc('a1'), doc('a2')] });
    const storage = new InMemoryFileStorage();

    const moved = await migrateLegacyFiles(source, storage);

    expect(moved).toEqual({
      user_avatars: 2,
      vehicle_photos: 0,
      service_invoices: 0,
      expense_attachments: 0,
      vehicle_document_files: 0,
    });
    const [first] = source.docs.user_avatars!;
    expect(first).toMatchObject({
      storageKey: 'avatars/owner-a1/a1.png',
      sizeBytes: 3,
      hasData: false,
    });
    expect(storage.files.get('avatars/owner-a1/a1.png')).toEqual({
      bytes: Buffer.from([1, 2, 3]),
      contentType: 'image/png',
    });
    expect(storage.files.size).toBe(2);
  });

  it('keeps an existing sizeBytes (the plaintext size of an encrypted document file)', async () => {
    const ciphertext = Buffer.alloc(12 + 16 + 5, 7);
    const source = new FakeSource({
      vehicle_document_files: [
        doc('f1', { contentType: 'application/pdf', data: ciphertext, sizeBytes: 5 }),
      ],
    });
    const storage = new InMemoryFileStorage();

    await migrateLegacyFiles(source, storage);

    expect(source.docs.vehicle_document_files![0]).toMatchObject({
      storageKey: 'vehicle-documents/owner-f1/f1.bin',
      sizeBytes: 5,
    });
    expect(storage.files.get('vehicle-documents/owner-f1/f1.bin')!.bytes).toEqual(ciphertext);
  });

  it('moves more rows than one batch', async () => {
    const docs = Array.from({ length: 120 }, (_, i) => doc(`p${i}`));
    const source = new FakeSource({ vehicle_photos: docs });

    const moved = await migrateLegacyFiles(source, new InMemoryFileStorage());

    expect(moved.vehicle_photos).toBe(120);
  });

  it('is safe to re-run: moved rows are skipped and nothing is rewritten', async () => {
    const source = new FakeSource({ user_avatars: [doc('a1')] });
    const storage = new InMemoryFileStorage();
    await migrateLegacyFiles(source, storage);

    const again = await migrateLegacyFiles(source, storage);

    expect(again.user_avatars).toBe(0);
    expect(storage.files.size).toBe(1);
  });

  it('stops instead of looping when a moved row keeps its data', async () => {
    const source = new FakeSource({ user_avatars: [doc('a1')] });
    source.ignoreUnset = true;

    await expect(migrateLegacyFiles(source, new InMemoryFileStorage())).rejects.toThrow(
      'user_avatars a1 still has data',
    );
  });
});

describe('legacyStorageKey', () => {
  it('uses the extension of the content type, or bin', () => {
    expect(
      legacyStorageKey(entry('expense_attachments'), doc('e1', { contentType: 'application/pdf' })),
    ).toBe('expense-attachments/owner-e1/e1.pdf');
    expect(
      legacyStorageKey(entry('service_invoices'), doc('s1', { contentType: 'image/jpeg' })),
    ).toBe('service-invoices/owner-s1/s1.jpg');
    expect(
      legacyStorageKey(entry('vehicle_photos'), doc('v1', { contentType: 'text/plain' })),
    ).toBe('vehicle-photos/owner-v1/v1.bin');
  });
});
