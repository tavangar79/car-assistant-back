import { beforeEach, describe, expect, it } from 'vitest';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../shared/errors.ts';
import { JPEG_BYTES, PDF_BYTES, PNG_BYTES, WEBP_BYTES } from '../../test/image-fixtures.ts';
import { InMemoryExpenseAttachmentRepository } from '../../test/in-memory-expense-attachment.repository.ts';
import { InMemoryExpenseRepository } from '../../test/in-memory-expense.repository.ts';
import { InMemoryFuelLogRepository } from '../../test/in-memory-fuel-log.repository.ts';
import { InMemoryOdometerReadingRepository } from '../../test/in-memory-odometer.repository.ts';
import { InMemoryServiceIntervalRepository } from '../../test/in-memory-service-interval.repository.ts';
import { InMemoryServiceInvoiceRepository } from '../../test/in-memory-service-invoice.repository.ts';
import { InMemoryServiceVisitRepository } from '../../test/in-memory-service-visit.repository.ts';
import { InMemoryVehiclePhotoRepository } from '../../test/in-memory-vehicle-photo.repository.ts';
import { InMemoryVehicleRepository } from '../../test/in-memory-vehicle.repository.ts';
import { VEHICLE_CATALOG } from '../vehicle-catalog/vehicle-catalog.data.ts';
import { VehicleCatalog } from '../vehicle-catalog/vehicle-catalog.ts';
import { VehicleService } from './vehicle.service.ts';
import type { CreateVehicleInput } from './vehicle.types.ts';

const ALICE = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BOB = 'bbbbbbbbbbbbbbbbbbbbbbbb';
// 1405 in Tehran, so the latest allowed year is 1406.
const NOW = new Date('2026-10-17T10:00:00Z');

function vehicleInput(overrides: Partial<CreateVehicleInput> = {}): CreateVehicleInput {
  return {
    nickname: 'تارا اتوماتیک نقره‌ای',
    plate: { twoDigits: '72', letter: 'ب', threeDigits: '345', provinceCode: '68' },
    vin: 'NAAM21CA9KK123456',
    makeId: 'iran-khodro',
    modelId: 'tara',
    trimId: 'tara-v4-at',
    yearJalali: 1402,
    mileageKm: 34500,
    color: 'white',
    ...overrides,
  };
}

const plate = (threeDigits: string): CreateVehicleInput['plate'] => ({
  twoDigits: '11',
  letter: 'ج',
  threeDigits,
  provinceCode: '22',
});

async function validationDetails(promise: Promise<unknown>): Promise<unknown> {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ValidationError);
  return (err as ValidationError).details;
}

describe('VehicleService', () => {
  let vehicles: InMemoryVehicleRepository;
  let photos: InMemoryVehiclePhotoRepository;
  let readings: InMemoryOdometerReadingRepository;
  let serviceVisits: InMemoryServiceVisitRepository;
  let serviceInvoices: InMemoryServiceInvoiceRepository;
  let serviceIntervals: InMemoryServiceIntervalRepository;
  let fuelLogs: InMemoryFuelLogRepository;
  let expenses: InMemoryExpenseRepository;
  let expenseAttachments: InMemoryExpenseAttachmentRepository;
  let service: VehicleService;

  beforeEach(() => {
    vehicles = new InMemoryVehicleRepository();
    photos = new InMemoryVehiclePhotoRepository();
    readings = new InMemoryOdometerReadingRepository(vehicles);
    serviceVisits = new InMemoryServiceVisitRepository();
    serviceInvoices = new InMemoryServiceInvoiceRepository();
    serviceIntervals = new InMemoryServiceIntervalRepository();
    fuelLogs = new InMemoryFuelLogRepository();
    expenses = new InMemoryExpenseRepository();
    expenseAttachments = new InMemoryExpenseAttachmentRepository();
    service = new VehicleService({
      vehicles,
      photos,
      readings,
      serviceVisits,
      serviceInvoices,
      serviceIntervals,
      fuelLogs,
      expenses,
      expenseAttachments,
      catalog: new VehicleCatalog(VEHICLE_CATALOG),
      now: () => NOW,
    });
  });

  describe('create', () => {
    it('returns the vehicle with catalog names and no photo', async () => {
      const created = await service.create(ALICE, vehicleInput());

      expect(created).toMatchObject({
        nickname: 'تارا اتوماتیک نقره‌ای',
        plate: { twoDigits: '72', letter: 'ب', threeDigits: '345', provinceCode: '68' },
        vin: 'NAAM21CA9KK123456',
        make: { id: 'iran-khodro', name: 'ایران خودرو' },
        model: { id: 'tara', name: 'تارا' },
        trim: { id: 'tara-v4-at', name: 'V4 اتوماتیک - فول آپشن' },
        yearJalali: 1402,
        mileageKm: 34500,
        color: 'white',
        photoUrl: null,
      });
    });

    it('stores missing optional fields as null', async () => {
      const created = await service.create(
        ALICE,
        vehicleInput({ vin: undefined, trimId: undefined, color: undefined }),
      );

      expect(created).toMatchObject({ vin: null, trim: null, color: null });
    });

    it('makes the first vehicle default even when isDefault is false', async () => {
      const first = await service.create(ALICE, vehicleInput({ isDefault: false }));

      expect(first.isDefault).toBe(true);
    });

    it('does not make a later vehicle default unless asked', async () => {
      await service.create(ALICE, vehicleInput({ plate: plate('100') }));

      const second = await service.create(ALICE, vehicleInput({ plate: plate('200') }));

      expect(second.isDefault).toBe(false);
    });

    it('moves the default flag when a new vehicle asks for it', async () => {
      const first = await service.create(ALICE, vehicleInput({ plate: plate('100') }));

      const second = await service.create(
        ALICE,
        vehicleInput({ plate: plate('200'), isDefault: true }),
      );

      expect(second.isDefault).toBe(true);
      expect((await service.getById(ALICE, first.id)).isDefault).toBe(false);
    });

    it('rejects a plate already in the same garage with 409', async () => {
      await service.create(ALICE, vehicleInput());

      const err = await service.create(ALICE, vehicleInput()).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ConflictError);
      expect((err as ConflictError).message).toBe('Plate already registered');
    });

    it("allows the same plate in another user's garage", async () => {
      await service.create(ALICE, vehicleInput());

      await expect(service.create(BOB, vehicleInput())).resolves.toMatchObject({ isDefault: true });
    });

    it('allows plates that differ in one part only', async () => {
      await service.create(ALICE, vehicleInput({ plate: plate('100') }));

      await expect(
        service.create(ALICE, vehicleInput({ plate: { ...plate('100'), letter: 'د' } })),
      ).resolves.toBeDefined();
    });

    it.each([
      [{ makeId: 'nope' }, { makeId: ['Unknown make'] }],
      [{ modelId: 'nope', trimId: null }, { modelId: ['Unknown model'] }],
      [{ trimId: 'nope' }, { trimId: ['Unknown trim'] }],
      [{ makeId: 'saipa', trimId: null }, { modelId: ['Model does not belong to the make'] }],
      [{ trimId: 'dena-plus-mt' }, { trimId: ['Trim does not belong to the model'] }],
    ])('rejects catalog choice %j', async (overrides, details) => {
      expect(await validationDetails(service.create(ALICE, vehicleInput(overrides)))).toEqual(
        details,
      );
    });

    it('accepts next Jalali year and rejects the one after', async () => {
      await expect(
        service.create(ALICE, vehicleInput({ plate: plate('100'), yearJalali: 1406 })),
      ).resolves.toBeDefined();

      expect(
        await validationDetails(service.create(ALICE, vehicleInput({ yearJalali: 1407 }))),
      ).toEqual({ yearJalali: ['Must be 1406 or earlier'] });
    });

    it('uses the injected clock for the year bound', async () => {
      service = new VehicleService({
        vehicles,
        photos,
        readings,
        serviceVisits,
        serviceInvoices,
        serviceIntervals,
        fuelLogs,
        expenses,
        expenseAttachments,
        catalog: new VehicleCatalog(VEHICLE_CATALOG),
        now: () => new Date('2026-03-20T12:00:00Z'), // Still 1404 in Tehran.
      });

      expect(
        await validationDetails(service.create(ALICE, vehicleInput({ yearJalali: 1406 }))),
      ).toEqual({ yearJalali: ['Must be 1405 or earlier'] });
    });
  });

  describe('list', () => {
    it("returns only the caller's vehicles, default first, then newest first", async () => {
      const first = await service.create(ALICE, vehicleInput({ plate: plate('100') }));
      const second = await service.create(ALICE, vehicleInput({ plate: plate('200') }));
      const third = await service.create(ALICE, vehicleInput({ plate: plate('300') }));
      await service.create(BOB, vehicleInput());
      await service.update(ALICE, second.id, { isDefault: true });

      const ids = (await service.list(ALICE)).map((v) => v.id);

      expect(ids).toEqual([second.id, third.id, first.id]);
    });

    it('includes photoUrl for vehicles that have a photo', async () => {
      const created = await service.create(ALICE, vehicleInput());
      const uploaded = await service.uploadPhoto(ALICE, created.id, PNG_BYTES);

      const [listed] = await service.list(ALICE);

      expect(listed?.photoUrl).toBe(uploaded.photoUrl);
    });
  });

  describe('getById', () => {
    it("returns 404 for another user's vehicle", async () => {
      const created = await service.create(ALICE, vehicleInput());

      await expect(service.getById(BOB, created.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it.each(['000000000000000000000000', 'not-an-id'])('returns 404 for id %s', async (id) => {
      await expect(service.getById(ALICE, id)).rejects.toThrow('Vehicle not found');
    });
  });

  describe('update', () => {
    it('updates only the given fields', async () => {
      const created = await service.create(ALICE, vehicleInput());

      const updated = await service.update(ALICE, created.id, { mileageKm: 40000, color: null });

      expect(updated).toMatchObject({ nickname: created.nickname, mileageKm: 40000, color: null });
    });

    it("returns 404 for another user's vehicle and leaves it unchanged", async () => {
      const created = await service.create(ALICE, vehicleInput());

      await expect(service.update(BOB, created.id, { mileageKm: 1 })).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect((await service.getById(ALICE, created.id)).mileageKm).toBe(34500);
    });

    it('checks a new model against the stored make and trim', async () => {
      const created = await service.create(ALICE, vehicleInput());

      expect(
        await validationDetails(service.update(ALICE, created.id, { modelId: 'dena-plus' })),
      ).toEqual({ trimId: ['Trim does not belong to the model'] });
    });

    it('accepts a new model with a matching trim', async () => {
      const created = await service.create(ALICE, vehicleInput());

      const updated = await service.update(ALICE, created.id, {
        modelId: 'dena-plus',
        trimId: 'dena-plus-mt',
      });

      expect(updated).toMatchObject({ model: { id: 'dena-plus' }, trim: { id: 'dena-plus-mt' } });
    });

    it('can clear the trim', async () => {
      const created = await service.create(ALICE, vehicleInput());

      expect((await service.update(ALICE, created.id, { trimId: null })).trim).toBeNull();
    });

    it('rejects a year after next Jalali year', async () => {
      const created = await service.create(ALICE, vehicleInput());

      expect(
        await validationDetails(service.update(ALICE, created.id, { yearJalali: 1407 })),
      ).toEqual({
        yearJalali: ['Must be 1406 or earlier'],
      });
    });

    it("rejects a plate used by another of the user's vehicles", async () => {
      await service.create(ALICE, vehicleInput({ plate: plate('100') }));
      const second = await service.create(ALICE, vehicleInput({ plate: plate('200') }));

      await expect(
        service.update(ALICE, second.id, { plate: plate('100') }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("accepts the vehicle's own plate", async () => {
      const created = await service.create(ALICE, vehicleInput());

      await expect(
        service.update(ALICE, created.id, { plate: vehicleInput().plate }),
      ).resolves.toBeDefined();
    });

    it('moves the default flag', async () => {
      const first = await service.create(ALICE, vehicleInput({ plate: plate('100') }));
      const second = await service.create(ALICE, vehicleInput({ plate: plate('200') }));

      await service.update(ALICE, second.id, { isDefault: true });

      expect((await service.getById(ALICE, first.id)).isDefault).toBe(false);
      expect((await service.getById(ALICE, second.id)).isDefault).toBe(true);
      expect((await service.list(ALICE)).filter((v) => v.isDefault)).toHaveLength(1);
    });

    it('rejects unsetting the default with 422 and changes nothing', async () => {
      const created = await service.create(ALICE, vehicleInput());

      const err = await service
        .update(ALICE, created.id, { isDefault: false, mileageKm: 1 })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AppError);
      expect(err).toMatchObject({
        statusCode: 422,
        message: 'Set another vehicle as default instead',
      });
      expect(await service.getById(ALICE, created.id)).toMatchObject({
        isDefault: true,
        mileageKm: 34500,
      });
    });

    it('ignores isDefault false on a vehicle that is not the default', async () => {
      const first = await service.create(ALICE, vehicleInput({ plate: plate('100') }));
      const second = await service.create(ALICE, vehicleInput({ plate: plate('200') }));

      const updated = await service.update(ALICE, second.id, { isDefault: false, mileageKm: 1 });

      expect(updated).toMatchObject({ isDefault: false, mileageKm: 1 });
      expect((await service.getById(ALICE, first.id)).isDefault).toBe(true);
    });

    it('keeps the default when isDefault true is sent to the default', async () => {
      const created = await service.create(ALICE, vehicleInput());

      await expect(service.update(ALICE, created.id, { isDefault: true })).resolves.toMatchObject({
        isDefault: true,
      });
    });
  });

  describe('remove', () => {
    it('removes the vehicle and its photo', async () => {
      const created = await service.create(ALICE, vehicleInput());
      await service.uploadPhoto(ALICE, created.id, PNG_BYTES);

      await service.remove(ALICE, created.id);

      expect(await service.list(ALICE)).toEqual([]);
      expect(photos.photos.size).toBe(0);
    });

    it('removes its odometer readings but not those of other vehicles', async () => {
      const removed = await service.create(ALICE, vehicleInput({ plate: plate('100') }));
      const kept = await service.create(ALICE, vehicleInput({ plate: plate('200') }));
      const recordedAt = NOW;
      await readings.record({ vehicleId: removed.id, mileageKm: 40000, recordedAt });
      await readings.record({ vehicleId: kept.id, mileageKm: 40000, recordedAt });

      await service.remove(ALICE, removed.id);

      expect(readings.readings.map((r) => r.vehicleId)).toEqual([kept.id]);
    });

    it('removes its service visits, invoices and interval overrides but not those of other vehicles', async () => {
      const removed = await service.create(ALICE, vehicleInput({ plate: plate('100') }));
      const kept = await service.create(ALICE, vehicleInput({ plate: plate('200') }));
      const visitOf = async (vehicleId: string) => {
        const visit = await serviceVisits.create({
          vehicleId,
          serviceDate: NOW,
          odometerKm: 1000,
          workshop: 'x',
          notes: null,
          lineItems: [],
          totalCost: 0,
        });
        await serviceInvoices.save(visit.id, {
          fileName: 'a.png',
          contentType: 'image/png',
          data: PNG_BYTES,
        });
        await serviceIntervals.save({ vehicleId, intervalId: 'engine_oil', km: 7000, months: 6 });
        return visit;
      };
      await visitOf(removed.id);
      const keptVisit = await visitOf(kept.id);

      await service.remove(ALICE, removed.id);

      expect([...serviceVisits.visits.keys()]).toEqual([keptVisit.id]);
      expect([...serviceInvoices.invoices.keys()]).toEqual([keptVisit.id]);
      expect((await serviceIntervals.listByVehicle(removed.id)).length).toBe(0);
      expect((await serviceIntervals.listByVehicle(kept.id)).length).toBe(1);
    });

    it('removes its fuel logs, expenses and attachments but not those of other vehicles', async () => {
      const removed = await service.create(ALICE, vehicleInput({ plate: plate('100') }));
      const kept = await service.create(ALICE, vehicleInput({ plate: plate('200') }));
      const recordsOf = async (vehicleId: string) => {
        const log = await fuelLogs.create({
          vehicleId,
          fueledAt: NOW,
          odometerKm: 1000,
          fuelType: 'super',
          volume: 40,
          totalCost: 100,
          isFullFill: true,
          station: null,
          paymentMethod: null,
          notes: null,
        });
        const expense = await expenses.create({
          vehicleId,
          category: 'toll',
          amount: 1000,
          title: null,
          referenceNumber: null,
          paidAt: NOW,
          expiresAt: null,
          expiryReminder: true,
          paymentMethod: null,
          issuer: null,
        });
        await expenseAttachments.save(expense.id, {
          fileName: 'a.pdf',
          contentType: 'application/pdf',
          data: PDF_BYTES,
        });
        return { log, expense };
      };
      await recordsOf(removed.id);
      const keptRecords = await recordsOf(kept.id);

      await service.remove(ALICE, removed.id);

      expect([...fuelLogs.logs.keys()]).toEqual([keptRecords.log.id]);
      expect([...expenses.expenses.keys()]).toEqual([keptRecords.expense.id]);
      expect([...expenseAttachments.attachments.keys()]).toEqual([keptRecords.expense.id]);
    });

    it('makes the newest remaining vehicle default when the default goes', async () => {
      const first = await service.create(ALICE, vehicleInput({ plate: plate('100') }));
      await service.create(ALICE, vehicleInput({ plate: plate('200') }));
      const third = await service.create(ALICE, vehicleInput({ plate: plate('300') }));

      await service.remove(ALICE, first.id);

      expect((await service.getById(ALICE, third.id)).isDefault).toBe(true);
      expect((await service.list(ALICE)).filter((v) => v.isDefault)).toHaveLength(1);
    });

    it('promotes the newest remaining vehicle, not the oldest', async () => {
      const first = await service.create(ALICE, vehicleInput({ plate: plate('100') }));
      const second = await service.create(ALICE, vehicleInput({ plate: plate('200') }));
      const third = await service.create(ALICE, vehicleInput({ plate: plate('300') }));
      await service.update(ALICE, second.id, { isDefault: true });

      await service.remove(ALICE, second.id);

      expect((await service.getById(ALICE, third.id)).isDefault).toBe(true);
      expect((await service.getById(ALICE, first.id)).isDefault).toBe(false);
    });

    it('leaves no default when the last vehicle goes', async () => {
      const created = await service.create(ALICE, vehicleInput());

      await service.remove(ALICE, created.id);

      expect(await service.list(ALICE)).toEqual([]);
    });

    it('keeps the default when another vehicle goes', async () => {
      const first = await service.create(ALICE, vehicleInput({ plate: plate('100') }));
      const second = await service.create(ALICE, vehicleInput({ plate: plate('200') }));

      await service.remove(ALICE, second.id);

      expect((await service.getById(ALICE, first.id)).isDefault).toBe(true);
    });

    it("returns 404 for another user's vehicle and keeps it", async () => {
      const created = await service.create(ALICE, vehicleInput());

      await expect(service.remove(BOB, created.id)).rejects.toBeInstanceOf(NotFoundError);
      expect(vehicles.vehicles.size).toBe(1);
    });
  });

  describe('photo', () => {
    it('stores a JPEG and sets a versioned photoUrl', async () => {
      const created = await service.create(ALICE, vehicleInput());

      const updated = await service.uploadPhoto(ALICE, created.id, JPEG_BYTES);

      expect(updated.photoUrl).toMatch(new RegExp(`^/api/vehicles/${created.id}/photo\\?v=\\d+$`));
      expect((await service.getPhoto(ALICE, created.id)).contentType).toBe('image/jpeg');
    });

    it('changes photoUrl when the photo is replaced', async () => {
      const created = await service.create(ALICE, vehicleInput());
      const first = await service.uploadPhoto(ALICE, created.id, JPEG_BYTES);

      const second = await service.uploadPhoto(ALICE, created.id, PNG_BYTES);

      expect(second.photoUrl).not.toBe(first.photoUrl);
      expect((await service.getPhoto(ALICE, created.id)).contentType).toBe('image/png');
    });

    it('rejects WebP and non-images', async () => {
      const created = await service.create(ALICE, vehicleInput());

      for (const bytes of [WEBP_BYTES, Buffer.from('not an image')]) {
        expect(await validationDetails(service.uploadPhoto(ALICE, created.id, bytes))).toEqual({
          photo: ['Must be a JPEG or PNG image'],
        });
      }
    });

    it("returns 404 for another user's vehicle", async () => {
      const created = await service.create(ALICE, vehicleInput());

      await expect(service.uploadPhoto(BOB, created.id, PNG_BYTES)).rejects.toThrow(
        'Vehicle not found',
      );
      await expect(service.getPhoto(BOB, created.id)).rejects.toThrow('Vehicle not found');
      await expect(service.deletePhoto(BOB, created.id)).rejects.toThrow('Vehicle not found');
    });

    it('returns 404 Photo not found when there is no photo', async () => {
      const created = await service.create(ALICE, vehicleInput());

      await expect(service.getPhoto(ALICE, created.id)).rejects.toThrow('Photo not found');
    });

    it('deletes the photo and is idempotent', async () => {
      const created = await service.create(ALICE, vehicleInput());
      await service.uploadPhoto(ALICE, created.id, PNG_BYTES);

      for (let i = 0; i < 2; i++) {
        expect((await service.deletePhoto(ALICE, created.id)).photoUrl).toBeNull();
      }
    });
  });
});
