import type { PrismaClient } from '@prisma/client';
import type { NewVehiclePhoto, VehiclePhoto } from './vehicle.types.ts';

export interface VehiclePhotoRepository {
  findByVehicleId(vehicleId: string): Promise<VehiclePhoto | null>;
  /** When each vehicle's photo last changed, without loading bytes. Vehicles without a photo are absent. */
  findUpdatedAts(vehicleIds: string[]): Promise<Map<string, Date>>;
  /** Creates or replaces the vehicle's photo. */
  save(vehicleId: string, photo: NewVehiclePhoto): Promise<VehiclePhoto>;
  /** No-op when the vehicle has no photo. */
  delete(vehicleId: string): Promise<void>;
}

const PHOTO_FIELDS = { contentType: true, data: true, updatedAt: true } as const;

export class PrismaVehiclePhotoRepository implements VehiclePhotoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByVehicleId(vehicleId: string): Promise<VehiclePhoto | null> {
    return this.prisma.vehiclePhoto.findUnique({ where: { vehicleId }, select: PHOTO_FIELDS });
  }

  async findUpdatedAts(vehicleIds: string[]): Promise<Map<string, Date>> {
    const photos = await this.prisma.vehiclePhoto.findMany({
      where: { vehicleId: { in: vehicleIds } },
      select: { vehicleId: true, updatedAt: true },
    });
    return new Map(photos.map((photo) => [photo.vehicleId, photo.updatedAt]));
  }

  save(vehicleId: string, { contentType, data }: NewVehiclePhoto): Promise<VehiclePhoto> {
    // Prisma wants bytes backed by a plain ArrayBuffer; a Node Buffer may sit on a shared pool.
    const photo = { contentType, data: new Uint8Array(data) };
    return this.prisma.vehiclePhoto.upsert({
      where: { vehicleId },
      create: { vehicleId, ...photo },
      update: photo,
      select: PHOTO_FIELDS,
    });
  }

  async delete(vehicleId: string): Promise<void> {
    await this.prisma.vehiclePhoto.deleteMany({ where: { vehicleId } });
  }
}
