import { SERVICE_CATEGORIES, type ServiceItemDef } from '../service-catalog/catalog.types.ts';
import {
  resolveForVehicle,
  resolveLeastSpecific,
  vehicleScope,
} from '../service-catalog/resolve-for-vehicle.ts';
import type { ServiceItemDefRepository } from '../service-catalog/service-item-def.repository.ts';
import type { VehicleService } from '../vehicles/vehicle.service.ts';
import type { Vehicle } from '../vehicles/vehicle.types.ts';

export interface ServiceItem {
  id: string;
  title: string;
  subtitle: string;
  /** Material Symbols icon name. */
  icon: string;
  /** Disabled for this vehicle (or, in the title lookup, on its least specific row). */
  disabled: boolean;
}

export interface ServiceCategory {
  id: string;
  title: string;
  items: ServiceItem[];
}

/** A resolved item with its category, keyed by `itemId` in the maps below. */
export interface CatalogItem extends ServiceItem {
  categoryId: string;
}

export interface ServiceItemCatalogDeps {
  definitions: ServiceItemDefRepository;
  /** Ownership checks for `list(userId, vehicleId)`. */
  vehicles: VehicleService;
}

const itemKey = (row: ServiceItemDef) => row.itemId;

const toItems = (rows: ServiceItemDef[]): Map<string, CatalogItem> =>
  new Map(
    rows.map((row) => [
      row.itemId,
      {
        id: row.itemId,
        title: row.title,
        subtitle: row.subtitle,
        icon: row.icon,
        disabled: row.disabled,
        categoryId: row.categoryId,
      },
    ]),
  );

/** Groups items (already in display order) by the static categories; empty categories are omitted. */
export function toCategories(items: Iterable<CatalogItem>): { categories: ServiceCategory[] } {
  const all = [...items];
  const categories = SERVICE_CATEGORIES.map((category) => ({
    id: category.id,
    title: category.title,
    items: all
      .filter((item) => item.categoryId === category.id)
      .map(({ id, title, subtitle, icon, disabled }) => ({ id, title, subtitle, icon, disabled })),
  }));
  return { categories: categories.filter((category) => category.items.length > 0) };
}

/** The service-item catalog stored in MongoDB, resolved per vehicle. Rows are loaded on every call (no cache). */
export class ServiceItemCatalog {
  constructor(private readonly deps: ServiceItemCatalogDeps) {}

  /** With a vehicle: its resolved catalog incl. disabled items (404 if not the caller's). Without: the title lookup. */
  async list(userId: string, vehicleId?: string): Promise<{ categories: ServiceCategory[] }> {
    if (vehicleId === undefined) return toCategories((await this.lookup()).values());
    const vehicle = await this.deps.vehicles.getById(userId, vehicleId);
    return toCategories((await this.forVehicle(vehicle)).values());
  }

  /** The vehicle's resolved items, including disabled ones, in display order. */
  async forVehicle(vehicle: Vehicle): Promise<Map<string, CatalogItem>> {
    const rows = await this.deps.definitions.listAll();
    return toItems(resolveForVehicle(rows, vehicleScope(vehicle), itemKey));
  }

  /** Every known item from its least specific row (global when it exists), in display order. */
  async lookup(): Promise<Map<string, CatalogItem>> {
    return toItems(resolveLeastSpecific(await this.deps.definitions.listAll(), itemKey));
  }
}
