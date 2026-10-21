import { randomBytes } from 'node:crypto';
import type { VehicleRepository } from '../modules/vehicles/vehicle.repository.ts';
import type {
  NewVehicle,
  VehicleChanges,
  VehicleRecord,
} from '../modules/vehicles/vehicle.types.ts';

export class InMemoryVehicleRepository implements VehicleRepository {
  readonly vehicles = new Map<string, VehicleRecord>();
  /** Each create is 1 ms later than the previous one, so "newest" is deterministic. */
  private clock = Date.UTC(2026, 0, 1);

  async listByUser(userId: string): Promise<VehicleRecord[]> {
    return [...this.vehicles.values()].filter((vehicle) => vehicle.userId === userId);
  }

  async findForUser(id: string, userId: string): Promise<VehicleRecord | null> {
    const vehicle = this.vehicles.get(id);
    return vehicle?.userId === userId ? vehicle : null;
  }

  async create(input: NewVehicle): Promise<VehicleRecord> {
    const now = new Date(this.clock++);
    const vehicle: VehicleRecord = {
      id: randomBytes(12).toString('hex'),
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.vehicles.set(vehicle.id, vehicle);
    return vehicle;
  }

  async update(id: string, changes: VehicleChanges): Promise<VehicleRecord> {
    const existing = this.vehicles.get(id);
    if (!existing) throw new Error(`Vehicle ${id} not found`);
    const defined = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined),
    );
    const updated: VehicleRecord = { ...existing, ...defined, updatedAt: new Date(this.clock++) };
    this.vehicles.set(id, updated);
    return updated;
  }

  async makeDefault(userId: string, id: string): Promise<VehicleRecord> {
    for (const vehicle of this.vehicles.values()) {
      if (vehicle.userId === userId && vehicle.id !== id)
        this.vehicles.set(vehicle.id, { ...vehicle, isDefault: false });
    }
    return this.update(id, { isDefault: true });
  }

  async deleteAndPromote(userId: string, id: string): Promise<void> {
    const deleted = this.vehicles.get(id);
    this.vehicles.delete(id);
    if (!deleted?.isDefault) return;
    const [newest] = (await this.listByUser(userId)).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    if (newest) this.vehicles.set(newest.id, { ...newest, isDefault: true });
  }
}
