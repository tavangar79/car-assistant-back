import type { PrismaClient } from '@prisma/client';
import type { CreateVehicleInput, UpdateVehicleInput, Vehicle } from './vehicle.types.ts';

// The service depends on this interface, so tests can swap in an in-memory version.
export interface VehicleRepository {
  findAll(): Promise<Vehicle[]>;
  findById(id: string): Promise<Vehicle | null>;
  create(input: CreateVehicleInput): Promise<Vehicle>;
  update(id: string, input: UpdateVehicleInput): Promise<Vehicle>;
  delete(id: string): Promise<void>;
}

export class PrismaVehicleRepository implements VehicleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findAll(): Promise<Vehicle[]> {
    return this.prisma.vehicle.findMany({ orderBy: { createdAt: 'desc' } });
  }

  findById(id: string): Promise<Vehicle | null> {
    return this.prisma.vehicle.findUnique({ where: { id } });
  }

  create(input: CreateVehicleInput): Promise<Vehicle> {
    return this.prisma.vehicle.create({ data: input });
  }

  update(id: string, input: UpdateVehicleInput): Promise<Vehicle> {
    return this.prisma.vehicle.update({ where: { id }, data: input });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.vehicle.delete({ where: { id } });
  }
}
