import { NotFoundError, ValidationError } from '../../shared/errors.ts';
import {
  COLLECTIONS,
  findCollection,
  toDocument,
  type CollectionName,
  type Row,
} from './collection-browser.ts';
import type { CollectionRepository } from './collection.repository.ts';
import { toPage } from './admin.types.ts';

export interface BrowseQuery {
  cursor?: string;
  limit: number;
  userId?: string;
  vehicleId?: string;
}

export interface BrowseResult {
  name: string;
  fields: readonly string[];
  documents: Row[];
  nextCursor: string | null;
}

/** Read-only paging over the registered collections (see collection-browser.ts). */
export class CollectionBrowserService {
  constructor(private readonly collections: CollectionRepository) {}

  /** Every registered collection with its row count, in registry order. */
  async list(): Promise<{ name: string; count: number }[]> {
    return Promise.all(
      COLLECTIONS.map(async ({ name }) => ({ name, count: await this.collections.count(name) })),
    );
  }

  /** 404 for an unknown or excluded name; 400 for a filter on a field the collection lacks. */
  async browse(
    name: string,
    { cursor, limit, userId, vehicleId }: BrowseQuery,
  ): Promise<BrowseResult> {
    const entry = findCollection(name);
    if (!entry) throw new NotFoundError('Collection');
    const filter = { userId, vehicleId };
    const invalid = (['userId', 'vehicleId'] as const).filter(
      (field) => filter[field] !== undefined && !entry.fields.includes(field),
    );
    if (invalid.length > 0) {
      throw new ValidationError(
        Object.fromEntries(invalid.map((field) => [field, [`${name} has no ${field} field`]])),
      );
    }

    const rows = await this.collections.find(entry.name as CollectionName, {
      filter,
      cursor,
      limit: limit + 1,
    });
    const page = toPage(rows as (Row & { id: string })[], limit);
    return {
      name: entry.name,
      fields: entry.fields,
      documents: page.items.map((row) => toDocument(entry, row)),
      nextCursor: page.nextCursor,
    };
  }
}
