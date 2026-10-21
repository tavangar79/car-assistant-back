import type { PrismaClient } from '@prisma/client';
import type { NewOdometerReading, OdometerReading } from './odometer.types.ts';

export interface OdometerReadingRepository {
  /** Atomically saves the reading and sets the vehicle's `mileageKm` to it. */
  record(reading: NewOdometerReading): Promise<OdometerReading>;
  /** Newest first: by `recordedAt`, then `createdAt`. */
  listByVehicle(vehicleId: string, limit: number): Promise<OdometerReading[]>;
  /** The oldest reading by `recordedAt`, or null without readings. */
  findEarliestByVehicle(vehicleId: string): Promise<OdometerReading | null>;
  /** No-op when the vehicle has no readings. */
  deleteByVehicle(vehicleId: string): Promise<void>;
}

export class PrismaOdometerReadingRepository implements OdometerReadingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async record(reading: NewOdometerReading): Promise<OdometerReading> {
    const [saved] = await this.prisma.$transaction([
      this.prisma.odometerReading.create({ data: reading }),
      this.prisma.vehicle.update({
        where: { id: reading.vehicleId },
        data: { mileageKm: reading.mileageKm },
      }),
    ]);
    return saved;
  }

  listByVehicle(vehicleId: string, limit: number): Promise<OdometerReading[]> {
    return this.prisma.odometerReading.findMany({
      where: { vehicleId },
      orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
  }

  findEarliestByVehicle(vehicleId: string): Promise<OdometerReading | null> {
    return this.prisma.odometerReading.findFirst({
      where: { vehicleId },
      orderBy: [{ recordedAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async deleteByVehicle(vehicleId: string): Promise<void> {
    await this.prisma.odometerReading.deleteMany({ where: { vehicleId } });
  }
}
