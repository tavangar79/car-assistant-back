import { randomBytes } from 'node:crypto';
import type { OdometerReadingRepository } from '../modules/vehicles/odometer.repository.ts';
import type { NewOdometerReading, OdometerReading } from '../modules/vehicles/odometer.types.ts';
import type { VehicleRepository } from '../modules/vehicles/vehicle.repository.ts';

export class InMemoryOdometerReadingRepository implements OdometerReadingRepository {
  readonly readings: OdometerReading[] = [];
  /** Each reading is created 1 ms after the previous one, so ties on `recordedAt` are deterministic. */
  private clock = Date.UTC(2026, 0, 1);

  /** Shares the vehicle store so `record` can update `mileageKm`, like the Prisma transaction. */
  constructor(private readonly vehicles: VehicleRepository) {}

  async record(input: NewOdometerReading): Promise<OdometerReading> {
    const reading: OdometerReading = {
      id: randomBytes(12).toString('hex'),
      ...input,
      createdAt: new Date(this.clock++),
    };
    this.readings.push(reading);
    await this.vehicles.update(input.vehicleId, { mileageKm: input.mileageKm });
    return reading;
  }

  async listByVehicle(vehicleId: string, limit: number): Promise<OdometerReading[]> {
    return this.readings
      .filter((reading) => reading.vehicleId === vehicleId)
      .sort(
        (a, b) =>
          b.recordedAt.getTime() - a.recordedAt.getTime() ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      )
      .slice(0, limit);
  }

  async findEarliestByVehicle(vehicleId: string): Promise<OdometerReading | null> {
    const all = await this.listByVehicle(vehicleId, this.readings.length);
    return all.at(-1) ?? null;
  }

  async deleteByVehicle(vehicleId: string): Promise<void> {
    const kept = this.readings.filter((reading) => reading.vehicleId !== vehicleId);
    this.readings.splice(0, this.readings.length, ...kept);
  }
}
