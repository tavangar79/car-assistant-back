import { NotFoundError, ValidationError } from '../../shared/errors.ts';
import { FUTURE_TOLERANCE_MS, type OdometerService } from '../vehicles/odometer.service.ts';
import type { VehicleService } from '../vehicles/vehicle.service.ts';
import type { Vehicle } from '../vehicles/vehicle.types.ts';
import { computeEconomy } from './compute-economy.ts';
import type { FuelLogRepository } from './fuel-log.repository.ts';
import type {
  CreateFuelLogInput,
  FuelLog,
  FuelLogRecord,
  UpdateFuelLogInput,
} from './fuel-log.types.ts';

export interface FuelLogServiceDeps {
  logs: FuelLogRepository;
  /** Ownership checks and the vehicle's current mileage come from here. */
  vehicles: VehicleService;
  /** Raises `Vehicle.mileageKm` when a log's odometer is higher. */
  odometer: OdometerService;
  now: () => Date;
}

export const FUEL_LIST_LIMIT = 50;

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

/** The API shape of a log; `economy` comes from `computeEconomy` over every log of its vehicle. */
export function toFuelLog(log: FuelLogRecord, economy: Map<string, number | null>): FuelLog {
  return { ...log, economy: economy.get(log.id) ?? null };
}

/** Fuel logs of a user's vehicle. Another user's vehicle or log is "not found". */
export class FuelLogService {
  constructor(private readonly deps: FuelLogServiceDeps) {}

  /** Newest `fueledAt` first, at most 50. Economy is computed over every log of the vehicle. */
  async list(userId: string, vehicleId: string): Promise<FuelLog[]> {
    const vehicle = await this.deps.vehicles.getById(userId, vehicleId);
    const logs = await this.deps.logs.listByVehicle(vehicle.id);
    const economy = computeEconomy(logs);
    return logs.slice(0, FUEL_LIST_LIMIT).map((log) => toFuelLog(log, economy));
  }

  async getById(userId: string, vehicleId: string, fuelLogId: string): Promise<FuelLog> {
    const { log } = await this.findOwned(userId, vehicleId, fuelLogId);
    return this.withEconomy(log);
  }

  async create(userId: string, vehicleId: string, input: CreateFuelLogInput): Promise<FuelLog> {
    const vehicle = await this.deps.vehicles.getById(userId, vehicleId);
    const fueledAt = new Date(input.fueledAt);
    this.ensureNotInFuture(fueledAt);

    const log = await this.deps.logs.create({
      vehicleId: vehicle.id,
      fueledAt,
      odometerKm: input.odometerKm,
      fuelType: input.fuelType,
      volume: input.volume,
      totalCost: input.totalCost,
      isFullFill: input.isFullFill,
      station: input.station ?? null,
      paymentMethod: input.paymentMethod ?? null,
      notes: input.notes ?? null,
    });
    await this.raiseMileage(userId, vehicle, log);
    return this.withEconomy(log);
  }

  async update(
    userId: string,
    vehicleId: string,
    fuelLogId: string,
    input: UpdateFuelLogInput,
  ): Promise<FuelLog> {
    const { vehicle, log: existing } = await this.findOwned(userId, vehicleId, fuelLogId);
    const fueledAt = input.fueledAt === undefined ? undefined : new Date(input.fueledAt);
    if (fueledAt) this.ensureNotInFuture(fueledAt);

    const log = await this.deps.logs.update(existing.id, {
      fueledAt,
      odometerKm: input.odometerKm,
      fuelType: input.fuelType,
      volume: input.volume,
      totalCost: input.totalCost,
      isFullFill: input.isFullFill,
      station: input.station,
      paymentMethod: input.paymentMethod,
      notes: input.notes,
    });
    await this.raiseMileage(userId, vehicle, log);
    return this.withEconomy(log);
  }

  /** Never changes the vehicle's mileage. */
  async remove(userId: string, vehicleId: string, fuelLogId: string): Promise<void> {
    const { log } = await this.findOwned(userId, vehicleId, fuelLogId);
    await this.deps.logs.delete(log.id);
  }

  private ensureNotInFuture(fueledAt: Date): void {
    if (fueledAt.getTime() > this.deps.now().getTime() + FUTURE_TOLERANCE_MS) {
      throw new ValidationError({ fueledAt: ['Must not be in the future'] });
    }
  }

  /** Mileage rule: a higher odometer becomes a reading dated `fueledAt`; a lower one is a back-dated log. */
  private async raiseMileage(userId: string, vehicle: Vehicle, log: FuelLogRecord): Promise<void> {
    if (log.odometerKm <= vehicle.mileageKm) return;
    await this.deps.odometer.record(userId, vehicle.id, {
      mileageKm: log.odometerKm,
      recordedAt: log.fueledAt.toISOString(),
    });
  }

  /** 404 for another user's vehicle, a malformed id, an unknown id, or another vehicle's log. */
  private async findOwned(
    userId: string,
    vehicleId: string,
    fuelLogId: string,
  ): Promise<{ vehicle: Vehicle; log: FuelLogRecord }> {
    const vehicle = await this.deps.vehicles.getById(userId, vehicleId);
    const log = OBJECT_ID_PATTERN.test(fuelLogId)
      ? await this.deps.logs.findForVehicle(fuelLogId, vehicle.id)
      : null;
    if (!log) throw new NotFoundError('Fuel log');
    return { vehicle, log };
  }

  private async withEconomy(log: FuelLogRecord): Promise<FuelLog> {
    return toFuelLog(log, computeEconomy(await this.deps.logs.listByVehicle(log.vehicleId)));
  }
}
