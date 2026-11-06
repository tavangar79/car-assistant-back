import type { PrismaClient } from '@prisma/client';
import {
  findCollection,
  type CollectionEntry,
  type CollectionName,
  type Row,
} from './collection-browser.ts';

/** Equality filters on id-like fields. */
export type CollectionFilter = Partial<
  Record<'userId' | 'vehicleId' | 'fromUserId' | 'toPhone', string>
>;

export interface FindOptions {
  filter?: CollectionFilter;
  /** Only rows with an id below this one. */
  cursor?: string;
  /** No limit returns every matching row. */
  limit?: number;
}

/** Read-only access to the registered collections, for the admin panel. */
export interface CollectionRepository {
  count(name: CollectionName, filter?: CollectionFilter): Promise<number>;
  /** Newest id first. Rows hold the registered fields only (never a file's `storageKey`). */
  find(name: CollectionName, options?: FindOptions): Promise<Row[]>;
  /** `createdAt` of every row created in [from, to). */
  listCreatedAt(name: CollectionName, from: Date, to: Date): Promise<Date[]>;
}

interface Delegate {
  count(args: { where?: object }): Promise<number>;
  findMany(args: object): Promise<Row[]>;
}

export class PrismaCollectionRepository implements CollectionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  count(name: CollectionName, filter: CollectionFilter = {}): Promise<number> {
    return this.delegate(this.entry(name)).count({ where: filter });
  }

  find(name: CollectionName, { filter = {}, cursor, limit }: FindOptions = {}): Promise<Row[]> {
    const entry = this.entry(name);
    return this.delegate(entry).findMany({
      where: { ...filter, ...(cursor ? { id: { lt: cursor } } : {}) },
      orderBy: { id: 'desc' },
      ...(limit === undefined ? {} : { take: limit }),
      select: Object.fromEntries(entry.fields.map((field) => [field, true])),
    });
  }

  async listCreatedAt(name: CollectionName, from: Date, to: Date): Promise<Date[]> {
    const rows = await this.delegate(this.entry(name)).findMany({
      where: { createdAt: { gte: from, lt: to } },
      select: { createdAt: true },
    });
    return rows.map((row) => row.createdAt as Date);
  }

  private entry(name: CollectionName): CollectionEntry {
    return findCollection(name)!;
  }

  private delegate(entry: CollectionEntry): Delegate {
    const key = entry.model[0]!.toLowerCase() + entry.model.slice(1);
    return (this.prisma as unknown as Record<string, Delegate>)[key]!;
  }
}
