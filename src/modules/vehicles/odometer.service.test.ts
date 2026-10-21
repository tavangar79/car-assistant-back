import { beforeEach, describe, expect, it } from 'vitest';
import { AppError, NotFoundError, ValidationError } from '../../shared/errors.ts';
import { InMemoryDocumentFileRepository } from '../../test/in-memory-document-file.repository.ts';
import { InMemoryDocumentRepository } from '../../test/in-memory-document.repository.ts';
import { InMemoryExpenseAttachmentRepository } from '../../test/in-memory-expense-attachment.repository.ts';
import { InMemoryExpenseRepository } from '../../test/in-memory-expense.repository.ts';
import { InMemoryFuelLogRepository } from '../../test/in-memory-fuel-log.repository.ts';
import { InMemoryNotificationRepository } from '../../test/in-memory-notification.repository.ts';
import { InMemoryOdometerReadingRepository } from '../../test/in-memory-odometer.repository.ts';
import { InMemoryServiceIntervalRepository } from '../../test/in-memory-service-interval.repository.ts';
import { InMemoryServiceInvoiceRepository } from '../../test/in-memory-service-invoice.repository.ts';
import { InMemoryServiceVisitRepository } from '../../test/in-memory-service-visit.repository.ts';
import { InMemoryVehiclePhotoRepository } from '../../test/in-memory-vehicle-photo.repository.ts';
import { InMemoryVehicleRepository } from '../../test/in-memory-vehicle.repository.ts';
import { VEHICLE_CATALOG } from '../vehicle-catalog/vehicle-catalog.data.ts';
import { VehicleCatalog } from '../vehicle-catalog/vehicle-catalog.ts';
import { MILEAGE_TOO_LOW, OdometerService } from './odometer.service.ts';
import { VehicleService } from './vehicle.service.ts';
import type { CreateVehicleInput } from './vehicle.types.ts';

const ALICE = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BOB = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const NOW = new Date('2026-10-17T10:00:00Z');

const vehicleInput = (threeDigits: string, mileageKm: number): CreateVehicleInput => ({
  nickname: 'تارا',
  plate: { twoDigits: '72', letter: 'ب', threeDigits, provinceCode: '68' },
  makeId: 'iran-khodro',
  modelId: 'tara',
  yearJalali: 1402,
  mileageKm,
});

describe('OdometerService', () => {
  let readings: InMemoryOdometerReadingRepository;
  let vehicleService: VehicleService;
  let service: OdometerService;
  let vehicleId: string;

  beforeEach(async () => {
    const vehicles = new InMemoryVehicleRepository();
    readings = new InMemoryOdometerReadingRepository(vehicles);
    vehicleService = new VehicleService({
      vehicles,
      photos: new InMemoryVehiclePhotoRepository(),
      readings,
      serviceVisits: new InMemoryServiceVisitRepository(),
      serviceInvoices: new InMemoryServiceInvoiceRepository(),
      serviceIntervals: new InMemoryServiceIntervalRepository(),
      fuelLogs: new InMemoryFuelLogRepository(),
      expenses: new InMemoryExpenseRepository(),
      expenseAttachments: new InMemoryExpenseAttachmentRepository(),
      documents: new InMemoryDocumentRepository(),
      documentFiles: new InMemoryDocumentFileRepository(),
      notifications: new InMemoryNotificationRepository(),
      catalog: new VehicleCatalog(VEHICLE_CATALOG),
      now: () => NOW,
    });
    service = new OdometerService({ readings, vehicles: vehicleService, now: () => NOW });
    vehicleId = (await vehicleService.create(ALICE, vehicleInput('345', 34500))).id;
  });

  describe('record', () => {
    it('saves the reading and raises the vehicle mileage', async () => {
      const result = await service.record(ALICE, vehicleId, {
        mileageKm: 35000,
        recordedAt: '2026-10-16T08:00:00Z',
      });

      expect(result.reading).toEqual({
        id: expect.stringMatching(/^[a-f\d]{24}$/),
        vehicleId,
        mileageKm: 35000,
        recordedAt: new Date('2026-10-16T08:00:00Z'),
        createdAt: expect.any(Date),
      });
      expect(result.vehicle.id).toBe(vehicleId);
      expect(result.vehicle.mileageKm).toBe(35000);
      expect((await vehicleService.getById(ALICE, vehicleId)).mileageKm).toBe(35000);
    });

    it('defaults recordedAt to now', async () => {
      const { reading } = await service.record(ALICE, vehicleId, { mileageKm: 35000 });

      expect(reading.recordedAt).toEqual(NOW);
    });

    it('allows the same mileage as the current one', async () => {
      const { vehicle } = await service.record(ALICE, vehicleId, { mileageKm: 34500 });

      expect(vehicle.mileageKm).toBe(34500);
      expect(readings.readings).toHaveLength(1);
    });

    it('rejects a lower mileage with 422 and the current mileage', async () => {
      const err = await service
        .record(ALICE, vehicleId, { mileageKm: 34499 })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AppError);
      expect(err).toMatchObject({
        statusCode: 422,
        message: MILEAGE_TOO_LOW,
        details: { currentMileageKm: 34500 },
      });
      expect(readings.readings).toHaveLength(0);
    });

    it('accepts a time up to 1 minute in the future (clock skew)', async () => {
      const recordedAt = new Date(NOW.getTime() + 60_000).toISOString();

      const { reading } = await service.record(ALICE, vehicleId, { mileageKm: 35000, recordedAt });

      expect(reading.recordedAt.toISOString()).toBe(recordedAt);
    });

    it('rejects a time more than 1 minute in the future', async () => {
      const recordedAt = new Date(NOW.getTime() + 60_001).toISOString();

      const err = await service
        .record(ALICE, vehicleId, { mileageKm: 35000, recordedAt })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).details).toEqual({
        recordedAt: ['Must not be in the future'],
      });
      expect(readings.readings).toHaveLength(0);
    });

    it("returns 404 for another user's vehicle", async () => {
      await expect(service.record(BOB, vehicleId, { mileageKm: 35000 })).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(readings.readings).toHaveLength(0);
    });

    it('returns 404 for a malformed id', async () => {
      await expect(service.record(ALICE, 'nope', { mileageKm: 35000 })).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('list', () => {
    it('orders by recordedAt desc, then createdAt desc', async () => {
      const record = (mileageKm: number, recordedAt: string) =>
        service.record(ALICE, vehicleId, { mileageKm, recordedAt });
      const oldest = await record(35000, '2026-09-01T00:00:00Z');
      const middle = await record(36000, '2026-10-10T00:00:00Z');
      const sameTimeLater = await record(36000, '2026-10-10T00:00:00Z');
      const backDated = await record(36500, '2026-10-01T00:00:00Z');

      const list = await service.list(ALICE, vehicleId);

      expect(list.map((r) => r.id)).toEqual([
        sameTimeLater.reading.id,
        middle.reading.id,
        backDated.reading.id,
        oldest.reading.id,
      ]);
    });

    it('returns at most 50 readings', async () => {
      for (let i = 0; i < 51; i++) {
        await service.record(ALICE, vehicleId, { mileageKm: 35000 + i });
      }

      expect(await service.list(ALICE, vehicleId)).toHaveLength(50);
    });

    it('only returns readings of that vehicle', async () => {
      const other = await vehicleService.create(ALICE, vehicleInput('222', 0));
      await service.record(ALICE, other.id, { mileageKm: 10 });

      expect(await service.list(ALICE, vehicleId)).toEqual([]);
    });

    it("returns 404 for another user's vehicle", async () => {
      await expect(service.list(BOB, vehicleId)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
