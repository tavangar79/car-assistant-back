import type { VehiclePhotoRepository } from '../modules/vehicles/vehicle-photo.repository.ts';
import type { NewVehiclePhoto, StoredVehiclePhoto } from '../modules/vehicles/vehicle.types.ts';

export class InMemoryVehiclePhotoRepository implements VehiclePhotoRepository {
  readonly photos = new Map<string, StoredVehiclePhoto>();
  /** Each save is 1 ms later than the previous one, so `photoUrl` always changes. */
  private clock = Date.UTC(2026, 0, 1);

  async findByVehicleId(vehicleId: string): Promise<StoredVehiclePhoto | null> {
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

  async save(vehicleId: string, photo: NewVehiclePhoto): Promise<StoredVehiclePhoto> {
    const saved: StoredVehiclePhoto = { ...photo, updatedAt: new Date(this.clock++) };
    this.photos.set(vehicleId, saved);
    return saved;
  }

  async delete(vehicleId: string): Promise<string[]> {
    const photo = this.photos.get(vehicleId);
    this.photos.delete(vehicleId);
    return photo ? [photo.storageKey] : [];
  }
}
