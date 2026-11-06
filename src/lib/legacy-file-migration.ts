import type { FileStorage } from './file-storage.ts';

// One-off move of file bytes out of MongoDB (`data` Bytes fields) into FileStorage.
// Run with `npm run files:migrate`; safe to re-run, since only documents that still have `data` are read.

export interface LegacyFileCollection {
  /** The `@@map` collection name. */
  collection: string;
  /** The field that owns the file (its id goes into the key). */
  ownerField: string;
  /** Key folder, the same one the services use for new uploads. */
  folder: string;
  /** The bytes are AES-256-GCM ciphertext: stored as-is, and the key gets `.bin`. */
  encrypted?: boolean;
}

export const LEGACY_FILE_COLLECTIONS: readonly LegacyFileCollection[] = [
  { collection: 'user_avatars', ownerField: 'userId', folder: 'avatars' },
  { collection: 'vehicle_photos', ownerField: 'vehicleId', folder: 'vehicle-photos' },
  { collection: 'service_invoices', ownerField: 'serviceId', folder: 'service-invoices' },
  { collection: 'expense_attachments', ownerField: 'expenseId', folder: 'expense-attachments' },
  {
    collection: 'vehicle_document_files',
    ownerField: 'documentId',
    folder: 'vehicle-documents',
    encrypted: true,
  },
];

/** A document that still holds its bytes. */
export interface LegacyFileRow {
  id: string;
  ownerId: string;
  contentType: string;
  data: Buffer;
  /** Already stored on some models (for document files: the plaintext size). */
  sizeBytes: number | null;
}

/** Raw access to the collections, since `data` is no longer in the Prisma schema. */
export interface LegacyFileSource {
  /** Up to `limit` documents of the collection that still have a `data` field. */
  findWithData(entry: LegacyFileCollection, limit: number): Promise<LegacyFileRow[]>;
  /** Sets `storageKey` and `sizeBytes`, and unsets `data`. */
  markMoved(
    entry: LegacyFileCollection,
    id: string,
    fields: { storageKey: string; sizeBytes: number },
  ): Promise<void>;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/**
 * Built from server-side ids only, and the same on every run: a re-run after a crash between the
 * write and the DB update overwrites the same file instead of leaving an orphan.
 */
export function legacyStorageKey(entry: LegacyFileCollection, row: LegacyFileRow): string {
  const ext = entry.encrypted ? 'bin' : (EXTENSIONS[row.contentType] ?? 'bin');
  return `${entry.folder}/${row.ownerId}/${row.id}.${ext}`;
}

const BATCH = 50;

/** Moves every remaining file; returns how many rows moved per collection. */
export async function migrateLegacyFiles(
  source: LegacyFileSource,
  storage: FileStorage,
  collections: readonly LegacyFileCollection[] = LEGACY_FILE_COLLECTIONS,
): Promise<Record<string, number>> {
  const moved: Record<string, number> = {};
  for (const entry of collections) {
    const done = new Set<string>();
    for (;;) {
      const rows = await source.findWithData(entry, BATCH);
      if (rows.length === 0) break;
      for (const row of rows) {
        // A row that comes back after being moved would loop forever; stop loudly instead.
        if (done.has(row.id)) throw new Error(`${entry.collection} ${row.id} still has data`);
        const storageKey = legacyStorageKey(entry, row);
        const contentType = entry.encrypted ? 'application/octet-stream' : row.contentType;
        await storage.put(storageKey, row.data, contentType);
        await source.markMoved(entry, row.id, {
          storageKey,
          sizeBytes: row.sizeBytes ?? row.data.byteLength,
        });
        done.add(row.id);
      }
    }
    moved[entry.collection] = done.size;
  }
  return moved;
}
