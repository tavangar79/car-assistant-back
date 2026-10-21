import type { PrismaClient } from '@prisma/client';
import type { ServiceIntervalOverride } from './service-interval.types.ts';

export interface ServiceIntervalRepository {
  listByVehicle(vehicleId: string): Promise<ServiceIntervalOverride[]>;
  /** Creates or replaces the override. */
  save(override: ServiceIntervalOverride): Promise<void>;
  /** No-op when there is no override. */
  delete(vehicleId: string, intervalId: string): Promise<void>;
  deleteByVehicle(vehicleId: string): Promise<void>;
}

const OVERRIDE_FIELDS = { vehicleId: true, intervalId: true, km: true, months: true } as const;

export class PrismaServiceIntervalRepository implements ServiceIntervalRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listByVehicle(vehicleId: string): Promise<ServiceIntervalOverride[]> {
    return this.prisma.serviceInterval.findMany({ where: { vehicleId }, select: OVERRIDE_FIELDS });
  }

  async save({ vehicleId, intervalId, km, months }: ServiceIntervalOverride): Promise<void> {
    await this.prisma.serviceInterval.upsert({
      where: { vehicleId_intervalId: { vehicleId, intervalId } },
      create: { vehicleId, intervalId, km, months },
      update: { km, months },
    });
  }

  async delete(vehicleId: string, intervalId: string): Promise<void> {
    await this.prisma.serviceInterval.deleteMany({ where: { vehicleId, intervalId } });
  }

  async deleteByVehicle(vehicleId: string): Promise<void> {
    await this.prisma.serviceInterval.deleteMany({ where: { vehicleId } });
  }
}
