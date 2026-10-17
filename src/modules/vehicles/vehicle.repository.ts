import type { PrismaClient } from '@prisma/client';
import type { NewVehicle, VehicleChanges, VehicleRecord } from './vehicle.types.ts';

// The service depends on this interface, so tests can swap in an in-memory version.
export interface VehicleRepository {
  /** All of the user's vehicles, in no particular order. */
  listByUser(userId: string): Promise<VehicleRecord[]>;
  /** The vehicle only if it belongs to the user. */
  findForUser(id: string, userId: string): Promise<VehicleRecord | null>;
  create(vehicle: NewVehicle): Promise<VehicleRecord>;
  update(id: string, changes: VehicleChanges): Promise<VehicleRecord>;
  /** Clears `isDefault` on every vehicle of the user. */
  clearDefault(userId: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export class PrismaVehicleRepository implements VehicleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listByUser(userId: string): Promise<VehicleRecord[]> {
    return this.prisma.vehicle.findMany({ where: { userId } });
  }

  findForUser(id: string, userId: string): Promise<VehicleRecord | null> {
    return this.prisma.vehicle.findFirst({ where: { id, userId } });
  }

  create(vehicle: NewVehicle): Promise<VehicleRecord> {
    return this.prisma.vehicle.create({ data: vehicle });
  }

  update(id: string, changes: VehicleChanges): Promise<VehicleRecord> {
    return this.prisma.vehicle.update({ where: { id }, data: changes });
  }

  async clearDefault(userId: string): Promise<void> {
    await this.prisma.vehicle.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.vehicle.delete({ where: { id } });
  }
}
