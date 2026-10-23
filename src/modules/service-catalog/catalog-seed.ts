import { SEED_INTERVALS, SEED_SERVICE_ITEMS } from '../../scripts/catalog-seed.data.ts';
import type { NewIntervalDef, NewServiceItemDef } from './catalog.types.ts';
import type { IntervalDefRepository } from './interval-def.repository.ts';
import { specificity } from './resolve-for-vehicle.ts';
import type { ServiceItemDefRepository } from './service-item-def.repository.ts';

const GLOBAL = { makeId: null, modelId: null, trimId: null };

/** The seed items as global rows; `sortOrder` is the position in the seed list. */
export function globalServiceItemRows(): NewServiceItemDef[] {
  return SEED_SERVICE_ITEMS.map((item, index) => ({
    ...item,
    ...GLOBAL,
    sortOrder: index,
    disabled: false,
  }));
}

/** The seed intervals as global rows; `sortOrder` is the position in the seed list. */
export function globalIntervalRows(): NewIntervalDef[] {
  return SEED_INTERVALS.map((interval, index) => ({
    ...interval,
    coversItemIds: [...interval.coversItemIds],
    ...GLOBAL,
    sortOrder: index,
    disabled: false,
  }));
}

/** Creates the global item rows that are missing; never touches existing rows. Returns how many were created. */
export async function seedServiceItems(repository: ServiceItemDefRepository): Promise<number> {
  const existing = new Set(
    (await repository.listAll()).filter((r) => specificity(r) === 0).map((r) => r.itemId),
  );
  const missing = globalServiceItemRows().filter((row) => !existing.has(row.itemId));
  for (const row of missing) await repository.create(row);
  return missing.length;
}

/** Creates the global interval rows that are missing; never touches existing rows. Returns how many were created. */
export async function seedIntervals(repository: IntervalDefRepository): Promise<number> {
  const existing = new Set(
    (await repository.listAll()).filter((r) => specificity(r) === 0).map((r) => r.intervalId),
  );
  const missing = globalIntervalRows().filter((row) => !existing.has(row.intervalId));
  for (const row of missing) await repository.create(row);
  return missing.length;
}

/** Startup: seeds each collection that is still empty, so a fresh environment works without a manual step. */
export async function seedEmptyCatalog(
  items: ServiceItemDefRepository,
  intervals: IntervalDefRepository,
): Promise<void> {
  if ((await items.listAll()).length === 0) await seedServiceItems(items);
  if ((await intervals.listAll()).length === 0) await seedIntervals(intervals);
}
