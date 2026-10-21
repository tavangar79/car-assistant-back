import type { PrismaClient } from '@prisma/client';
import type { FuelLogChanges, FuelLogRecord, NewFuelLog } from './fuel-log.types.ts';

export interface FuelLogRepository {
  /** Every log of the vehicle (economy needs them all), newest `fueledAt` first, then newest `createdAt`. */
  listByVehicle(vehicleId: string): Promise<FuelLogRecord[]>;
  /** The log only if it belongs to the vehicle. */
  findForVehicle(id: string, vehicleId: string): Promise<FuelLogRecord | null>;
  create(log: NewFuelLog): Promise<FuelLogRecord>;
  update(id: string, changes: FuelLogChanges): Promise<FuelLogRecord>;
  delete(id: string): Promise<void>;
  deleteByVehicle(vehicleId: string): Promise<void>;
}

export class PrismaFuelLogRepository implements FuelLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listByVehicle(vehicleId: string): Promise<FuelLogRecord[]> {
    return this.prisma.fuelLog.findMany({
      where: { vehicleId },
      orderBy: [{ fueledAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  findForVehicle(id: string, vehicleId: string): Promise<FuelLogRecord | null> {
    return this.prisma.fuelLog.findFirst({ where: { id, vehicleId } });
  }

  create(log: NewFuelLog): Promise<FuelLogRecord> {
    return this.prisma.fuelLog.create({ data: log });
  }

  update(id: string, changes: FuelLogChanges): Promise<FuelLogRecord> {
    return this.prisma.fuelLog.update({ where: { id }, data: changes });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.fuelLog.delete({ where: { id } });
  }

  async deleteByVehicle(vehicleId: string): Promise<void> {
    await this.prisma.fuelLog.deleteMany({ where: { vehicleId } });
  }
}
