// `npm run files:migrate`: moves file bytes still stored in MongoDB (`data` fields) into UPLOAD_DIR.
// Safe to re-run. `data` is no longer in the Prisma schema, so this uses raw Mongo commands.
import 'dotenv/config';
import type { PrismaClient } from '@prisma/client';
import { loadEnv } from '../config/env.ts';
import {
  migrateLegacyFiles,
  type LegacyFileCollection,
  type LegacyFileRow,
  type LegacyFileSource,
} from '../lib/legacy-file-migration.ts';
import { LocalFileStorage } from '../lib/local-file-storage.ts';
import { createPrismaClient } from '../lib/prisma.ts';

/** A raw document as `$runCommandRaw` returns it (MongoDB extended JSON). */
interface RawDocument {
  _id: { $oid: string };
  contentType: string;
  data: { $binary: { base64: string } };
  sizeBytes?: number;
  [field: string]: unknown;
}

class PrismaLegacyFileSource implements LegacyFileSource {
  constructor(private readonly prisma: PrismaClient) {}

  async findWithData(entry: LegacyFileCollection, limit: number): Promise<LegacyFileRow[]> {
    const result = (await this.prisma.$runCommandRaw({
      find: entry.collection,
      filter: { data: { $exists: true } },
      limit,
    })) as unknown as { cursor: { firstBatch: RawDocument[] } };
    return result.cursor.firstBatch.map((doc) => ({
      id: doc._id.$oid,
      ownerId: (doc[entry.ownerField] as { $oid: string }).$oid,
      contentType: doc.contentType,
      data: Buffer.from(doc.data.$binary.base64, 'base64'),
      sizeBytes: typeof doc.sizeBytes === 'number' ? doc.sizeBytes : null,
    }));
  }

  async markMoved(
    entry: LegacyFileCollection,
    id: string,
    fields: { storageKey: string; sizeBytes: number },
  ): Promise<void> {
    const result = (await this.prisma.$runCommandRaw({
      update: entry.collection,
      updates: [{ q: { _id: { $oid: id } }, u: { $set: fields, $unset: { data: '' } } }],
    })) as { ok: number; nModified?: number };
    if (result.ok !== 1) throw new Error(`Could not update ${entry.collection} ${id}`);
  }
}

const env = loadEnv();
const prisma = createPrismaClient();
try {
  const moved = await migrateLegacyFiles(
    new PrismaLegacyFileSource(prisma),
    new LocalFileStorage(env.UPLOAD_DIR),
  );
  for (const [collection, count] of Object.entries(moved)) {
    console.log(`${collection}: ${count} moved`);
  }
} finally {
  await prisma.$disconnect();
}
