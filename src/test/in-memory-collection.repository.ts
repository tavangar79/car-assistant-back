import type { CollectionName, Row } from '../modules/admin/collection-browser.ts';
import type {
  CollectionFilter,
  CollectionRepository,
  FindOptions,
} from '../modules/admin/collection.repository.ts';

/** Rows per collection, seeded by the test. Rows must have a string `id`. */
export class InMemoryCollectionRepository implements CollectionRepository {
  constructor(private readonly rows: Partial<Record<CollectionName, Row[]>> = {}) {}

  async count(name: CollectionName, filter: CollectionFilter = {}): Promise<number> {
    return this.matching(name, filter).length;
  }

  async find(
    name: CollectionName,
    { filter = {}, cursor, limit }: FindOptions = {},
  ): Promise<Row[]> {
    return this.matching(name, filter)
      .filter((row) => !cursor || (row.id as string) < cursor)
      .sort((a, b) => ((a.id as string) < (b.id as string) ? 1 : -1))
      .slice(0, limit);
  }

  async listCreatedAt(name: CollectionName, from: Date, to: Date): Promise<Date[]> {
    return (this.rows[name] ?? [])
      .map((row) => row.createdAt as Date)
      .filter((createdAt) => createdAt >= from && createdAt < to);
  }

  private matching(name: CollectionName, filter: CollectionFilter): Row[] {
    return (this.rows[name] ?? []).filter((row) =>
      Object.entries(filter).every(([field, value]) => value === undefined || row[field] === value),
    );
  }
}
