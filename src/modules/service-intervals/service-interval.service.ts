import { ValidationError } from '../../shared/errors.ts';
import type { ServiceVisitRepository } from '../service-visits/service-visit.repository.ts';
import type { OdometerReadingRepository } from '../vehicles/odometer.repository.ts';
import type { VehicleService } from '../vehicles/vehicle.service.ts';
import { computeDue, type DueItem } from './compute-due.ts';
import type { ServiceIntervalDefinition } from './service-interval.data.ts';
import type { ServiceIntervalRepository } from './service-interval.repository.ts';
import type {
  ServiceInterval,
  ServiceIntervalOverride,
  SetIntervalsInput,
} from './service-interval.types.ts';

export interface ServiceIntervalServiceDeps {
  definitions: ServiceIntervalDefinition[];
  overrides: ServiceIntervalRepository;
  /** Ownership checks, current mileage and `createdAt` come from here. */
  vehicles: VehicleService;
  visits: ServiceVisitRepository;
  readings: OdometerReadingRepository;
  now: () => Date;
}

export interface DueReport {
  asOf: Date;
  mileageKm: number;
  items: DueItem[];
}

/** Per-vehicle service intervals and what is due. Another user's vehicle is "not found". */
export class ServiceIntervalService {
  constructor(private readonly deps: ServiceIntervalServiceDeps) {}

  /** Always all intervals, in catalog order. */
  async list(userId: string, vehicleId: string): Promise<ServiceInterval[]> {
    const vehicle = await this.deps.vehicles.getById(userId, vehicleId);
    return this.intervalsOf(vehicle.id);
  }

  /** Sets the listed intervals; unlisted ones keep their value. Values equal to the defaults remove the override. */
  async set(
    userId: string,
    vehicleId: string,
    input: SetIntervalsInput,
  ): Promise<ServiceInterval[]> {
    const vehicle = await this.deps.vehicles.getById(userId, vehicleId);
    const byId = new Map(this.deps.definitions.map((definition) => [definition.id, definition]));
    const unknown = input.intervals.map((i) => i.id).filter((id) => !byId.has(id));
    if (unknown.length > 0) {
      throw new ValidationError({ intervals: unknown.map((id) => `Unknown interval: ${id}`) });
    }

    for (const { id, km, months } of input.intervals) {
      const definition = byId.get(id)!;
      if (km === definition.defaultKm && months === definition.defaultMonths) {
        await this.deps.overrides.delete(vehicle.id, id);
      } else {
        await this.deps.overrides.save({ vehicleId: vehicle.id, intervalId: id, km, months });
      }
    }
    return this.intervalsOf(vehicle.id);
  }

  /** Back to the factory defaults for every interval. */
  async resetAll(userId: string, vehicleId: string): Promise<ServiceInterval[]> {
    const vehicle = await this.deps.vehicles.getById(userId, vehicleId);
    await this.deps.overrides.deleteByVehicle(vehicle.id);
    return this.intervalsOf(vehicle.id);
  }

  async due(userId: string, vehicleId: string): Promise<DueReport> {
    const { vehicles, visits, readings, now } = this.deps;
    const vehicle = await vehicles.getById(userId, vehicleId);
    const earliest = await readings.findEarliestByVehicle(vehicle.id);
    const asOf = now();
    return {
      asOf,
      mileageKm: vehicle.mileageKm,
      items: computeDue({
        asOf,
        mileageKm: vehicle.mileageKm,
        intervals: await this.intervalsOf(vehicle.id),
        visits: await visits.listByVehicle(vehicle.id),
        fallback: earliest
          ? { km: earliest.mileageKm, date: earliest.recordedAt }
          : { km: vehicle.mileageKm, date: vehicle.createdAt },
      }),
    };
  }

  private async intervalsOf(vehicleId: string): Promise<ServiceInterval[]> {
    const overrides = new Map<string, ServiceIntervalOverride>(
      (await this.deps.overrides.listByVehicle(vehicleId)).map((o) => [o.intervalId, o]),
    );
    return this.deps.definitions.map((definition) => {
      const override = overrides.get(definition.id);
      return {
        ...definition,
        km: override?.km ?? definition.defaultKm,
        months: override?.months ?? definition.defaultMonths,
        isCustom: override !== undefined,
      };
    });
  }
}
