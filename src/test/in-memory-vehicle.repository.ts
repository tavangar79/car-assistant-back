import { randomBytes } from 'node:crypto';
import type { VehicleRepository } from '../modules/vehicles/vehicle.repository.ts';
import type {
  CreateVehicleInput,
  UpdateVehicleInput,
  Vehicle,
} from '../modules/vehicles/vehicle.types.ts';

export class InMemoryVehicleRepository implements VehicleRepository {
  private readonly vehicles = new Map<string, Vehicle>();

  async findAll(): Promise<Vehicle[]> {
    return [...this.vehicles.values()];
  }

  async findById(id: string): Promise<Vehicle | null> {
    return this.vehicles.get(id) ?? null;
  }

  async create(input: CreateVehicleInput): Promise<Vehicle> {
    const now = new Date();
    const vehicle: Vehicle = {
      id: randomBytes(12).toString('hex'),
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.vehicles.set(vehicle.id, vehicle);
    return vehicle;
  }

  async update(id: string, input: UpdateVehicleInput): Promise<Vehicle> {
    const existing = this.vehicles.get(id);
    if (!existing) throw new Error(`Vehicle ${id} not found`);
    const updated: Vehicle = { ...existing, ...input, updatedAt: new Date() };
    this.vehicles.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.vehicles.delete(id);
  }
}
