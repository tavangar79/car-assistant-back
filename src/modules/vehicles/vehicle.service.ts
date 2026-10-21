import { AppError, ConflictError, NotFoundError, ValidationError } from '../../shared/errors.ts';
import { detectImageType, type ImageContentType } from '../../shared/image-type.ts';
import type { ServiceIntervalRepository } from '../service-intervals/service-interval.repository.ts';
import type { ServiceInvoiceRepository } from '../service-visits/service-invoice.repository.ts';
import type { ServiceVisitRepository } from '../service-visits/service-visit.repository.ts';
import type { CatalogSelection, VehicleCatalog } from '../vehicle-catalog/vehicle-catalog.ts';
import { jalaliYear } from './jalali-year.ts';
import type { OdometerReadingRepository } from './odometer.repository.ts';
import type { VehiclePhotoRepository } from './vehicle-photo.repository.ts';
import type { VehicleRepository } from './vehicle.repository.ts';
import type {
  CreateVehicleInput,
  Plate,
  UpdateVehicleInput,
  Vehicle,
  VehicleChanges,
  VehiclePhoto,
  VehicleRecord,
} from './vehicle.types.ts';

export interface VehicleServiceDeps {
  vehicles: VehicleRepository;
  photos: VehiclePhotoRepository;
  readings: OdometerReadingRepository;
  serviceVisits: ServiceVisitRepository;
  serviceInvoices: ServiceInvoiceRepository;
  serviceIntervals: ServiceIntervalRepository;
  catalog: VehicleCatalog;
  now: () => Date;
}

export const VEHICLE_PHOTO_CONTENT_TYPES: readonly ImageContentType[] = ['image/jpeg', 'image/png'];
export const VEHICLE_PHOTO_BAD_TYPE = 'Must be a JPEG or PNG image';
export const DEFAULT_REQUIRED = 'Set another vehicle as default instead';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

const samePlate = (a: Plate, b: Plate) =>
  a.twoDigits === b.twoDigits &&
  a.letter === b.letter &&
  a.threeDigits === b.threeDigits &&
  a.provinceCode === b.provinceCode;

const newestFirst = (a: VehicleRecord, b: VehicleRecord) =>
  b.createdAt.getTime() - a.createdAt.getTime();

/** A user's garage. Every method is scoped to `userId`; another user's vehicle is "not found". */
export class VehicleService {
  constructor(private readonly deps: VehicleServiceDeps) {}

  /** Default first, then newest first. */
  async list(userId: string): Promise<Vehicle[]> {
    const records = (await this.deps.vehicles.listByUser(userId)).sort(
      (a, b) => Number(b.isDefault) - Number(a.isDefault) || newestFirst(a, b),
    );
    const photos = await this.deps.photos.findUpdatedAts(records.map((r) => r.id));
    return records.map((record) => this.toVehicle(record, photos.get(record.id) ?? null));
  }

  async getById(userId: string, id: string): Promise<Vehicle> {
    return this.withPhotoUrl(await this.findOwned(userId, id));
  }

  /** The user's first vehicle is always the default; a new default replaces the old one. */
  async create(userId: string, input: CreateVehicleInput): Promise<Vehicle> {
    const { vehicles } = this.deps;
    const selection = {
      makeId: input.makeId,
      modelId: input.modelId,
      trimId: input.trimId ?? null,
    };
    this.validate({ yearJalali: input.yearJalali, selection });

    const garage = await vehicles.listByUser(userId);
    this.ensurePlateIsFree(garage, input.plate);

    const isFirst = garage.length === 0;
    const record = await vehicles.create({
      userId,
      nickname: input.nickname,
      plate: input.plate,
      vin: input.vin ?? null,
      ...selection,
      yearJalali: input.yearJalali,
      mileageKm: input.mileageKm,
      color: input.color ?? null,
      isDefault: isFirst,
    });
    const saved =
      !isFirst && input.isDefault === true ? await vehicles.makeDefault(userId, record.id) : record;
    return this.toVehicle(saved, null);
  }

  /**
   * Make, model and trim are checked as a combination with the stored values.
   * The default can only move to another vehicle, never be unset (422).
   */
  async update(userId: string, id: string, input: UpdateVehicleInput): Promise<Vehicle> {
    const { vehicles } = this.deps;
    const existing = await this.findOwned(userId, id);
    if (input.isDefault === false && existing.isDefault) throw new AppError(422, DEFAULT_REQUIRED);

    const changesCatalog =
      input.makeId !== undefined || input.modelId !== undefined || input.trimId !== undefined;
    this.validate({
      yearJalali: input.yearJalali,
      selection: changesCatalog
        ? {
            makeId: input.makeId ?? existing.makeId,
            modelId: input.modelId ?? existing.modelId,
            trimId: input.trimId === undefined ? existing.trimId : input.trimId,
          }
        : undefined,
    });

    if (input.plate) {
      const others = (await vehicles.listByUser(userId)).filter((v) => v.id !== existing.id);
      this.ensurePlateIsFree(others, input.plate);
    }
    if (input.isDefault === true && !existing.isDefault) {
      await vehicles.makeDefault(userId, existing.id);
    }

    const changes: VehicleChanges = {
      nickname: input.nickname,
      plate: input.plate,
      vin: input.vin,
      makeId: input.makeId,
      modelId: input.modelId,
      trimId: input.trimId,
      yearJalali: input.yearJalali,
      mileageKm: input.mileageKm,
      color: input.color,
    };
    return this.withPhotoUrl(await vehicles.update(existing.id, changes));
  }

  /**
   * Deletes the photo, odometer readings, service visits (with invoices) and interval overrides too.
   * If the default goes, the newest remaining vehicle becomes default.
   */
  async remove(userId: string, id: string): Promise<void> {
    const { vehicles, photos, readings, serviceVisits, serviceInvoices, serviceIntervals } =
      this.deps;
    const existing = await this.findOwned(userId, id);
    await photos.delete(existing.id);
    await readings.deleteByVehicle(existing.id);
    const serviceIds = await serviceVisits.deleteByVehicle(existing.id);
    await serviceInvoices.deleteByServiceIds(serviceIds);
    await serviceIntervals.deleteByVehicle(existing.id);
    await vehicles.deleteAndPromote(userId, existing.id);
  }

  /** Stores (or replaces) the photo. The type comes from the magic bytes, not the client. */
  async uploadPhoto(userId: string, id: string, data: Uint8Array): Promise<Vehicle> {
    const existing = await this.findOwned(userId, id);
    const contentType = detectImageType(data, VEHICLE_PHOTO_CONTENT_TYPES);
    if (!contentType) throw new ValidationError({ photo: [VEHICLE_PHOTO_BAD_TYPE] });
    const photo = await this.deps.photos.save(existing.id, { contentType, data });
    return this.toVehicle(existing, photo.updatedAt);
  }

  async getPhoto(userId: string, id: string): Promise<VehiclePhoto> {
    const existing = await this.findOwned(userId, id);
    const photo = await this.deps.photos.findByVehicleId(existing.id);
    if (!photo) throw new NotFoundError('Photo');
    return photo;
  }

  /** Idempotent: deleting a missing photo still succeeds. */
  async deletePhoto(userId: string, id: string): Promise<Vehicle> {
    const existing = await this.findOwned(userId, id);
    await this.deps.photos.delete(existing.id);
    return this.toVehicle(existing, null);
  }

  /** Rules zod can't express: the year bound depends on today, and the catalog combination. */
  private validate({
    yearJalali,
    selection,
  }: {
    yearJalali?: number;
    selection?: CatalogSelection;
  }): void {
    const details: Record<string, string[]> = selection
      ? { ...this.deps.catalog.check(selection) }
      : {};
    const maxYear = jalaliYear(this.deps.now()) + 1;
    if (yearJalali !== undefined && yearJalali > maxYear) {
      details.yearJalali = [`Must be ${maxYear} or earlier`];
    }
    if (Object.keys(details).length > 0) throw new ValidationError(details);
  }

  private ensurePlateIsFree(garage: VehicleRecord[], plate: Plate): void {
    if (garage.some((vehicle) => samePlate(vehicle.plate, plate))) {
      throw new ConflictError('Plate already registered');
    }
  }

  /** 404 for a malformed id, an unknown id, or another user's vehicle. */
  private async findOwned(userId: string, id: string): Promise<VehicleRecord> {
    const vehicle = OBJECT_ID_PATTERN.test(id)
      ? await this.deps.vehicles.findForUser(id, userId)
      : null;
    if (!vehicle) throw new NotFoundError('Vehicle');
    return vehicle;
  }

  private async withPhotoUrl(record: VehicleRecord): Promise<Vehicle> {
    const photos = await this.deps.photos.findUpdatedAts([record.id]);
    return this.toVehicle(record, photos.get(record.id) ?? null);
  }

  private toVehicle(record: VehicleRecord, photoUpdatedAt: Date | null): Vehicle {
    const { make, model, trim } = this.deps.catalog.resolve(record);
    return {
      id: record.id,
      nickname: record.nickname,
      plate: record.plate,
      vin: record.vin,
      make,
      model,
      trim,
      yearJalali: record.yearJalali,
      mileageKm: record.mileageKm,
      color: record.color,
      isDefault: record.isDefault,
      photoUrl: photoUpdatedAt
        ? `/api/vehicles/${record.id}/photo?v=${photoUpdatedAt.getTime()}`
        : null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
