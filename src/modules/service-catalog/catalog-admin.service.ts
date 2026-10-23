import { AppError, ConflictError, NotFoundError, ValidationError } from '../../shared/errors.ts';
import type { VehicleCatalog } from '../vehicle-catalog/vehicle-catalog.ts';
import type {
  CreateIntervalDefInput,
  CreateServiceItemDefInput,
  IntervalDef,
  ServiceItemDef,
  UpdateIntervalDefInput,
  UpdateServiceItemDefInput,
} from './catalog.types.ts';
import type { IntervalDefRepository } from './interval-def.repository.ts';
import { specificity, type CatalogScope } from './resolve-for-vehicle.ts';
import type { ServiceItemDefRepository } from './service-item-def.repository.ts';

export interface CatalogAdminServiceDeps {
  items: ServiceItemDefRepository;
  intervals: IntervalDefRepository;
  /** Scope ids must exist and belong together here. */
  vehicleCatalog: VehicleCatalog;
}

/** A row as the admin API returns it: the scope is nested. */
type AdminRow<T> = Omit<T, keyof CatalogScope> & { scope: CatalogScope };
export type ServiceItemRow = AdminRow<ServiceItemDef>;
export type IntervalRow = AdminRow<IntervalDef>;

export const GLOBAL_DELETE = 'A global row cannot be deleted; disable it instead';
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

function toRow<T extends CatalogScope>({ makeId, modelId, trimId, ...rest }: T): AdminRow<T> {
  return { ...rest, scope: { makeId, modelId, trimId } } as AdminRow<T>;
}

const sameScope = (a: CatalogScope, b: CatalogScope) =>
  a.makeId === b.makeId && a.modelId === b.modelId && a.trimId === b.trimId;

const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** By key, then specificity, then `sortOrder`, then id. */
function adminOrder<T extends ServiceItemDef | IntervalDef>(keyOf: (row: T) => string) {
  return (a: T, b: T) =>
    compareStrings(keyOf(a), keyOf(b)) ||
    specificity(a) - specificity(b) ||
    a.sortOrder - b.sortOrder ||
    compareStrings(a.id, b.id);
}

/** Admin CRUD over service item and interval rows in every scope. */
export class CatalogAdminService {
  constructor(private readonly deps: CatalogAdminServiceDeps) {}

  async listItems(): Promise<ServiceItemRow[]> {
    const rows = await this.deps.items.listAll();
    return rows.sort(adminOrder((row) => row.itemId)).map(toRow);
  }

  /** 400 for a bad scope, 409 when the same `itemId` + scope exists. */
  async createItem({ scope, ...fields }: CreateServiceItemDefInput): Promise<ServiceItemRow> {
    this.checkScope(scope);
    const rows = await this.deps.items.listAll();
    if (rows.some((row) => row.itemId === fields.itemId && sameScope(row, scope))) {
      throw new ConflictError('A row for this item and scope already exists');
    }
    return toRow(await this.deps.items.create({ ...fields, ...scope }));
  }

  async updateItem(id: string, input: UpdateServiceItemDefInput): Promise<ServiceItemRow> {
    await this.findItem(id);
    // The schema only lets `itemId` / `scope` through when absent, so `input` holds editable fields only.
    return toRow(await this.deps.items.update(id, input));
  }

  /** 422 for a global row: visits reference the id, so it can only be disabled. */
  async deleteItem(id: string): Promise<void> {
    const row = await this.findItem(id);
    if (specificity(row) === 0) throw new AppError(422, GLOBAL_DELETE);
    await this.deps.items.delete(id);
  }

  async listIntervals(): Promise<IntervalRow[]> {
    const rows = await this.deps.intervals.listAll();
    return rows.sort(adminOrder((row) => row.intervalId)).map(toRow);
  }

  /** 400 for a bad scope or an unknown covered item, 409 when the same `intervalId` + scope exists. */
  async createInterval({ scope, ...fields }: CreateIntervalDefInput): Promise<IntervalRow> {
    this.checkScope(scope);
    await this.checkCoveredItems(fields.coversItemIds);
    const rows = await this.deps.intervals.listAll();
    if (rows.some((row) => row.intervalId === fields.intervalId && sameScope(row, scope))) {
      throw new ConflictError('A row for this interval and scope already exists');
    }
    return toRow(await this.deps.intervals.create({ ...fields, ...scope }));
  }

  async updateInterval(id: string, input: UpdateIntervalDefInput): Promise<IntervalRow> {
    await this.findInterval(id);
    if (input.coversItemIds) await this.checkCoveredItems(input.coversItemIds);
    // The schema only lets `intervalId` / `scope` through when absent, so `input` holds editable fields only.
    return toRow(await this.deps.intervals.update(id, input));
  }

  /** 422 for a global row: overrides reference the id, so it can only be disabled. */
  async deleteInterval(id: string): Promise<void> {
    const row = await this.findInterval(id);
    if (specificity(row) === 0) throw new AppError(422, GLOBAL_DELETE);
    await this.deps.intervals.delete(id);
  }

  private checkScope(scope: CatalogScope): void {
    const errors = this.deps.vehicleCatalog.checkScope(scope);
    if (errors.length > 0) throw new ValidationError({ scope: errors });
  }

  /** Each id must exist as an `itemId` in some item row (any scope). */
  private async checkCoveredItems(itemIds: string[]): Promise<void> {
    const known = new Set((await this.deps.items.listAll()).map((row) => row.itemId));
    const unknown = itemIds.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new ValidationError({ coversItemIds: unknown.map((id) => `Unknown item: ${id}`) });
    }
  }

  private async findItem(id: string): Promise<ServiceItemDef> {
    const row = OBJECT_ID_PATTERN.test(id) ? await this.deps.items.findById(id) : null;
    if (!row) throw new NotFoundError('Service item');
    return row;
  }

  private async findInterval(id: string): Promise<IntervalDef> {
    const row = OBJECT_ID_PATTERN.test(id) ? await this.deps.intervals.findById(id) : null;
    if (!row) throw new NotFoundError('Interval');
    return row;
  }
}
