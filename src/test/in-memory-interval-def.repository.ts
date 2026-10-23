import { randomBytes } from 'node:crypto';
import type {
  IntervalDef,
  IntervalDefPatch,
  NewIntervalDef,
} from '../modules/service-catalog/catalog.types.ts';
import type { IntervalDefRepository } from '../modules/service-catalog/interval-def.repository.ts';

export class InMemoryIntervalDefRepository implements IntervalDefRepository {
  private readonly rows = new Map<string, IntervalDef>();

  /** Starts with these rows, e.g. `globalIntervalRows()`. */
  constructor(initial: NewIntervalDef[] = []) {
    for (const row of initial) this.insert(row);
  }

  async listAll(): Promise<IntervalDef[]> {
    return [...this.rows.values()];
  }

  async findById(id: string): Promise<IntervalDef | null> {
    return this.rows.get(id) ?? null;
  }

  async create(row: NewIntervalDef): Promise<IntervalDef> {
    return this.insert(row);
  }

  async update(id: string, patch: IntervalDefPatch): Promise<IntervalDef> {
    const existing = this.rows.get(id);
    if (!existing) throw new Error(`IntervalDef ${id} not found`);
    const row: IntervalDef = { ...existing, ...patch, updatedAt: new Date() };
    this.rows.set(id, row);
    return row;
  }

  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }

  private insert(input: NewIntervalDef): IntervalDef {
    const now = new Date();
    const row: IntervalDef = {
      ...input,
      coversItemIds: [...input.coversItemIds],
      id: randomBytes(12).toString('hex'),
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, row);
    return row;
  }
}
