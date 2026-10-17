import type { VehiclePhotoRepository } from '../modules/vehicles/vehicle-photo.repository.ts';
import type { NewVehiclePhoto, VehiclePhoto } from '../modules/vehicles/vehicle.types.ts';

export class InMemoryVehiclePhotoRepository implements VehiclePhotoRepository {
  readonly photos = new Map<string, VehiclePhoto>();
  /** Each save is 1 ms later than the previous one, so `photoUrl` always changes. */
  private clock = Date.UTC(2026, 0, 1);

  async findByVehicleId(vehicleId: string): Promise<VehiclePhoto | null> {
    return this.photos.get(vehicleId) ?? null;
  }

  async findUpdatedAts(vehicleIds: string[]): Promise<Map<string, Date>> {
    const result = new Map<string, Date>();
    for (const id of vehicleIds) {
      const photo = this.photos.get(id);
      if (photo) result.set(id, photo.updatedAt);
    }
    return result;
  }

  async save(vehicleId: string, photo: NewVehiclePhoto): Promise<VehiclePhoto> {
    const saved: VehiclePhoto = { ...photo, updatedAt: new Date(this.clock++) };
    this.photos.set(vehicleId, saved);
    return saved;
  }

  async delete(vehicleId: string): Promise<void> {
    this.photos.delete(vehicleId);
  }
}
