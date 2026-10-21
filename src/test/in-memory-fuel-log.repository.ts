import { randomBytes } from 'node:crypto';
import type { FuelLogRepository } from '../modules/fuel-logs/fuel-log.repository.ts';
import type {
  FuelLogChanges,
  FuelLogRecord,
  NewFuelLog,
} from '../modules/fuel-logs/fuel-log.types.ts';

export class InMemoryFuelLogRepository implements FuelLogRepository {
  readonly logs = new Map<string, FuelLogRecord>();
  /** Each write is 1 ms later than the previous one, so "newest" is deterministic. */
  private clock = Date.UTC(2026, 0, 1);

  async listByVehicle(vehicleId: string): Promise<FuelLogRecord[]> {
    return [...this.logs.values()]
      .filter((log) => log.vehicleId === vehicleId)
      .sort(
        (a, b) =>
          b.fueledAt.getTime() - a.fueledAt.getTime() ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      );
  }

  async findForVehicle(id: string, vehicleId: string): Promise<FuelLogRecord | null> {
    const log = this.logs.get(id);
    return log?.vehicleId === vehicleId ? log : null;
  }

  async create(input: NewFuelLog): Promise<FuelLogRecord> {
    const now = new Date(this.clock++);
    const log: FuelLogRecord = {
      id: randomBytes(12).toString('hex'),
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.logs.set(log.id, log);
    return log;
  }

  async update(id: string, changes: FuelLogChanges): Promise<FuelLogRecord> {
    const existing = this.logs.get(id);
    if (!existing) throw new Error(`Fuel log ${id} not found`);
    const defined = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined),
    );
    const updated: FuelLogRecord = { ...existing, ...defined, updatedAt: new Date(this.clock++) };
    this.logs.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.logs.delete(id);
  }

  async deleteByVehicle(vehicleId: string): Promise<void> {
    for (const log of await this.listByVehicle(vehicleId)) this.logs.delete(log.id);
  }
}
