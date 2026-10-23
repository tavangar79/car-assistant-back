import { randomBytes } from 'node:crypto';
import type {
  NewServiceItemDef,
  ServiceItemDef,
  ServiceItemDefPatch,
} from '../modules/service-catalog/catalog.types.ts';
import type { ServiceItemDefRepository } from '../modules/service-catalog/service-item-def.repository.ts';

export class InMemoryServiceItemDefRepository implements ServiceItemDefRepository {
  private readonly rows = new Map<string, ServiceItemDef>();

  /** Starts with these rows, e.g. `globalServiceItemRows()`. */
  constructor(initial: NewServiceItemDef[] = []) {
    for (const row of initial) this.insert(row);
  }

  async listAll(): Promise<ServiceItemDef[]> {
    return [...this.rows.values()];
  }

  async findById(id: string): Promise<ServiceItemDef | null> {
    return this.rows.get(id) ?? null;
  }

  async create(row: NewServiceItemDef): Promise<ServiceItemDef> {
    return this.insert(row);
  }

  async update(id: string, patch: ServiceItemDefPatch): Promise<ServiceItemDef> {
    const existing = this.rows.get(id);
    if (!existing) throw new Error(`ServiceItemDef ${id} not found`);
    const row: ServiceItemDef = { ...existing, ...patch, updatedAt: new Date() };
    this.rows.set(id, row);
    return row;
  }

  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }

  private insert(input: NewServiceItemDef): ServiceItemDef {
    const now = new Date();
    const row: ServiceItemDef = {
      ...input,
      id: randomBytes(12).toString('hex'),
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, row);
    return row;
  }
}
