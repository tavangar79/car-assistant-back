import { ValidationError } from '../../shared/errors.ts';
import type { IntervalDef } from '../service-catalog/catalog.types.ts';
import type { IntervalDefRepository } from '../service-catalog/interval-def.repository.ts';
import { resolveForVehicle, vehicleScope } from '../service-catalog/resolve-for-vehicle.ts';
import type { ServiceVisitRepository } from '../service-visits/service-visit.repository.ts';
import type { OdometerReadingRepository } from '../vehicles/odometer.repository.ts';
import type { VehicleService } from '../vehicles/vehicle.service.ts';
import type { Vehicle } from '../vehicles/vehicle.types.ts';
import { computeDue, type DueItem } from './compute-due.ts';
import type { ServiceIntervalRepository } from './service-interval.repository.ts';
import type {
  ServiceInterval,
  ServiceIntervalDefinition,
  ServiceIntervalOverride,
  SetIntervalsInput,
} from './service-interval.types.ts';

export interface ServiceIntervalServiceDeps {
  /** Interval rows in every scope; each vehicle gets its resolved, non-disabled ones. */
  definitions: IntervalDefRepository;
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

const toDefinition = (row: IntervalDef): ServiceIntervalDefinition => ({
  id: row.intervalId,
  title: row.title,
  description: row.description,
  icon: row.icon,
  coversItemIds: row.coversItemIds,
  defaultKm: row.km,
  defaultMonths: row.months,
});

/** Per-vehicle service intervals and what is due. Another user's vehicle is "not found". */
export class ServiceIntervalService {
  constructor(private readonly deps: ServiceIntervalServiceDeps) {}

  /** The vehicle's resolved, non-disabled intervals, by `sortOrder` then id. */
  async list(userId: string, vehicleId: string): Promise<ServiceInterval[]> {
    const vehicle = await this.deps.vehicles.getById(userId, vehicleId);
    return this.intervalsOf(vehicle);
  }

  /** Sets the listed intervals; unlisted ones keep their value. Values equal to the defaults remove the override. */
  async set(
    userId: string,
    vehicleId: string,
    input: SetIntervalsInput,
  ): Promise<ServiceInterval[]> {
    const vehicle = await this.deps.vehicles.getById(userId, vehicleId);
    const byId = new Map(
      (await this.definitionsOf(vehicle)).map((definition) => [definition.id, definition]),
    );
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
    return this.intervalsOf(vehicle);
  }

  /** Back to the factory defaults for every interval. */
  async resetAll(userId: string, vehicleId: string): Promise<ServiceInterval[]> {
    const vehicle = await this.deps.vehicles.getById(userId, vehicleId);
    await this.deps.overrides.deleteByVehicle(vehicle.id);
    return this.intervalsOf(vehicle);
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
        intervals: await this.intervalsOf(vehicle),
        visits: await visits.listByVehicle(vehicle.id),
        fallback: earliest
          ? { km: earliest.mileageKm, date: earliest.recordedAt }
          : { km: vehicle.mileageKm, date: vehicle.createdAt },
      }),
    };
  }

  /** Resolved for the vehicle, minus disabled ones. */
  private async definitionsOf(vehicle: Vehicle): Promise<ServiceIntervalDefinition[]> {
    const rows = await this.deps.definitions.listAll();
    return resolveForVehicle(rows, vehicleScope(vehicle), (row) => row.intervalId)
      .filter((row) => !row.disabled)
      .map(toDefinition);
  }

  /** Overrides of intervals that are no longer resolved are ignored (kept in storage). */
  private async intervalsOf(vehicle: Vehicle): Promise<ServiceInterval[]> {
    const overrides = new Map<string, ServiceIntervalOverride>(
      (await this.deps.overrides.listByVehicle(vehicle.id)).map((o) => [o.intervalId, o]),
    );
    return (await this.definitionsOf(vehicle)).map((definition) => {
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
