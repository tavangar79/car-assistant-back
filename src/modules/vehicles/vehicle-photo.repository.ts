import type { PrismaClient } from '@prisma/client';
import type { NewVehiclePhoto, StoredVehiclePhoto } from './vehicle.types.ts';

export interface VehiclePhotoRepository {
  findByVehicleId(vehicleId: string): Promise<StoredVehiclePhoto | null>;
  /** When each vehicle's photo last changed. Vehicles without a photo are absent. */
  findUpdatedAts(vehicleIds: string[]): Promise<Map<string, Date>>;
  /** Creates or replaces the vehicle's photo row. */
  save(vehicleId: string, photo: NewVehiclePhoto): Promise<StoredVehiclePhoto>;
  /** The storage keys of the removed rows (none when the vehicle has no photo). */
  delete(vehicleId: string): Promise<string[]>;
}

const PHOTO_FIELDS = {
  contentType: true,
  storageKey: true,
  sizeBytes: true,
  updatedAt: true,
} as const;

export class PrismaVehiclePhotoRepository implements VehiclePhotoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByVehicleId(vehicleId: string): Promise<StoredVehiclePhoto | null> {
    return this.prisma.vehiclePhoto.findUnique({ where: { vehicleId }, select: PHOTO_FIELDS });
  }

  async findUpdatedAts(vehicleIds: string[]): Promise<Map<string, Date>> {
    const photos = await this.prisma.vehiclePhoto.findMany({
      where: { vehicleId: { in: vehicleIds } },
      select: { vehicleId: true, updatedAt: true },
    });
    return new Map(photos.map((photo) => [photo.vehicleId, photo.updatedAt]));
  }

  save(vehicleId: string, photo: NewVehiclePhoto): Promise<StoredVehiclePhoto> {
    return this.prisma.vehiclePhoto.upsert({
      where: { vehicleId },
      create: { vehicleId, ...photo },
      update: photo,
      select: PHOTO_FIELDS,
    });
  }

  async delete(vehicleId: string): Promise<string[]> {
    const rows = await this.prisma.vehiclePhoto.findMany({
      where: { vehicleId },
      select: { storageKey: true },
    });
    await this.prisma.vehiclePhoto.deleteMany({ where: { vehicleId } });
    return rows.map((row) => row.storageKey);
  }
}
