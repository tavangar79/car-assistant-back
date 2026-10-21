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
  /** Atomically makes this the user's only default vehicle. */
  makeDefault(userId: string, id: string): Promise<VehicleRecord>;
  /** Atomically deletes the vehicle; if it was the default, the newest remaining one takes over. */
  deleteAndPromote(userId: string, id: string): Promise<void>;
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

  async makeDefault(userId: string, id: string): Promise<VehicleRecord> {
    const [, vehicle] = await this.prisma.$transaction([
      this.prisma.vehicle.updateMany({
        where: { userId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      }),
      this.prisma.vehicle.update({ where: { id }, data: { isDefault: true } }),
    ]);
    return vehicle;
  }

  async deleteAndPromote(userId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.vehicle.delete({ where: { id } });
      if (!deleted.isDefault) return;
      const newest = await tx.vehicle.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      if (newest) await tx.vehicle.update({ where: { id: newest.id }, data: { isDefault: true } });
    });
  }
}
