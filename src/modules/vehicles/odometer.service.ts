import { AppError, ValidationError } from '../../shared/errors.ts';
import type { OdometerReadingRepository } from './odometer.repository.ts';
import type { OdometerReading, RecordOdometerInput, RecordedOdometer } from './odometer.types.ts';
import type { VehicleService } from './vehicle.service.ts';

export interface OdometerServiceDeps {
  readings: OdometerReadingRepository;
  /** Ownership checks and the Vehicle JSON come from here. */
  vehicles: VehicleService;
  now: () => Date;
}

export const MILEAGE_TOO_LOW = 'Mileage cannot be lower than the current reading';
export const ODOMETER_LIST_LIMIT = 50;
/** Allows for a client clock that runs a little ahead. Shared with service visits. */
export const FUTURE_TOLERANCE_MS = 60_000;

/** Odometer readings of a user's vehicle. Another user's vehicle is "not found". */
export class OdometerService {
  constructor(private readonly deps: OdometerServiceDeps) {}

  /** Sets the vehicle's mileage. Never lower than the current one (422); an equal value is fine. */
  async record(
    userId: string,
    vehicleId: string,
    input: RecordOdometerInput,
  ): Promise<RecordedOdometer> {
    const { readings, vehicles, now } = this.deps;
    const vehicle = await vehicles.getById(userId, vehicleId);

    const current = now();
    const recordedAt = input.recordedAt ? new Date(input.recordedAt) : current;
    if (recordedAt.getTime() > current.getTime() + FUTURE_TOLERANCE_MS) {
      throw new ValidationError({ recordedAt: ['Must not be in the future'] });
    }
    if (input.mileageKm < vehicle.mileageKm) {
      throw new AppError(422, MILEAGE_TOO_LOW, { currentMileageKm: vehicle.mileageKm });
    }

    const reading = await readings.record({
      vehicleId: vehicle.id,
      mileageKm: input.mileageKm,
      recordedAt,
    });
    return { reading, vehicle: await vehicles.getById(userId, vehicle.id) };
  }

  /** Newest first, at most 50. */
  async list(userId: string, vehicleId: string): Promise<OdometerReading[]> {
    const vehicle = await this.deps.vehicles.getById(userId, vehicleId);
    return this.deps.readings.listByVehicle(vehicle.id, ODOMETER_LIST_LIMIT);
  }
}
