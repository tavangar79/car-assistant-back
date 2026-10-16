import { NotFoundError } from '../../shared/errors.ts';
import type { VehicleRepository } from './vehicle.repository.ts';
import type { CreateVehicleInput, UpdateVehicleInput, Vehicle } from './vehicle.types.ts';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export class VehicleService {
  constructor(private readonly repository: VehicleRepository) {}

  list(): Promise<Vehicle[]> {
    return this.repository.findAll();
  }

  async getById(id: string): Promise<Vehicle> {
    const vehicle = OBJECT_ID_PATTERN.test(id) ? await this.repository.findById(id) : null;
    if (!vehicle) throw new NotFoundError('Vehicle');
    return vehicle;
  }

  create(input: CreateVehicleInput): Promise<Vehicle> {
    return this.repository.create(input);
  }

  async update(id: string, input: UpdateVehicleInput): Promise<Vehicle> {
    await this.getById(id);
    return this.repository.update(id, input);
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.repository.delete(id);
  }
}
