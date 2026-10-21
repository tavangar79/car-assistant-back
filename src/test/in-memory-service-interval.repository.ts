import type { ServiceIntervalRepository } from '../modules/service-intervals/service-interval.repository.ts';
import type { ServiceIntervalOverride } from '../modules/service-intervals/service-interval.types.ts';

const key = (vehicleId: string, intervalId: string) => `${vehicleId}:${intervalId}`;

export class InMemoryServiceIntervalRepository implements ServiceIntervalRepository {
  readonly overrides = new Map<string, ServiceIntervalOverride>();

  async listByVehicle(vehicleId: string): Promise<ServiceIntervalOverride[]> {
    return [...this.overrides.values()].filter((override) => override.vehicleId === vehicleId);
  }

  async save(override: ServiceIntervalOverride): Promise<void> {
    this.overrides.set(key(override.vehicleId, override.intervalId), { ...override });
  }

  async delete(vehicleId: string, intervalId: string): Promise<void> {
    this.overrides.delete(key(vehicleId, intervalId));
  }

  async deleteByVehicle(vehicleId: string): Promise<void> {
    for (const [k, override] of this.overrides) {
      if (override.vehicleId === vehicleId) this.overrides.delete(k);
    }
  }
}
