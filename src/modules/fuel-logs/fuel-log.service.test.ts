import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '../../shared/errors.ts';
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
import { OdometerService } from '../vehicles/odometer.service.ts';
import { VehicleService } from '../vehicles/vehicle.service.ts';
import type { CreateVehicleInput } from '../vehicles/vehicle.types.ts';
import { FuelLogService } from './fuel-log.service.ts';
import type { CreateFuelLogInput } from './fuel-log.types.ts';

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

function logInput(overrides: Partial<CreateFuelLogInput> = {}): CreateFuelLogInput {
  return {
    fueledAt: '2026-10-10T08:00:00Z',
    odometerKm: 34850,
    fuelType: 'super',
    volume: 48.5,
    totalCost: 145500,
    isFullFill: true,
    ...overrides,
  };
}

async function validationDetails(promise: Promise<unknown>): Promise<unknown> {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ValidationError);
  return (err as ValidationError).details;
}

describe('FuelLogService', () => {
  let readings: InMemoryOdometerReadingRepository;
  let logs: InMemoryFuelLogRepository;
  let vehicleService: VehicleService;
  let service: FuelLogService;
  let vehicleId: string;

  beforeEach(async () => {
    const vehicles = new InMemoryVehicleRepository();
    readings = new InMemoryOdometerReadingRepository(vehicles);
    logs = new InMemoryFuelLogRepository();
    vehicleService = new VehicleService({
      vehicles,
      photos: new InMemoryVehiclePhotoRepository(),
      readings,
      serviceVisits: new InMemoryServiceVisitRepository(),
      serviceInvoices: new InMemoryServiceInvoiceRepository(),
      serviceIntervals: new InMemoryServiceIntervalRepository(),
      fuelLogs: logs,
      expenses: new InMemoryExpenseRepository(),
      expenseAttachments: new InMemoryExpenseAttachmentRepository(),
      catalog: new VehicleCatalog(VEHICLE_CATALOG),
      now: () => NOW,
    });
    service = new FuelLogService({
      logs,
      vehicles: vehicleService,
      odometer: new OdometerService({ readings, vehicles: vehicleService, now: () => NOW }),
      now: () => NOW,
    });
    vehicleId = (await vehicleService.create(ALICE, vehicleInput('345', 34500))).id;
  });

  const mileage = async () => (await vehicleService.getById(ALICE, vehicleId)).mileageKm;

  describe('create', () => {
    it('saves the log with nulls for absent optionals and no economy for the first log', async () => {
      const log = await service.create(ALICE, vehicleId, logInput());

      expect(log).toEqual({
        id: expect.stringMatching(/^[a-f\d]{24}$/),
        vehicleId,
        fueledAt: new Date('2026-10-10T08:00:00Z'),
        odometerKm: 34850,
        fuelType: 'super',
        volume: 48.5,
        totalCost: 145500,
        isFullFill: true,
        station: null,
        paymentMethod: null,
        notes: null,
        economy: null,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it('computes the economy against the previous full fill', async () => {
      await service.create(ALICE, vehicleId, logInput({ odometerKm: 34000, volume: 40 }));

      const second = await service.create(
        ALICE,
        vehicleId,
        logInput({ fueledAt: '2026-10-12T08:00:00Z', odometerKm: 34500, volume: 37.3 }),
      );

      expect(second.economy).toBe(7.46);
    });

    it('raises the vehicle mileage with a reading dated fueledAt when the odometer is higher', async () => {
      await service.create(ALICE, vehicleId, logInput({ odometerKm: 34850 }));

      expect(await mileage()).toBe(34850);
      expect(readings.readings).toHaveLength(1);
      expect(readings.readings[0]).toMatchObject({
        vehicleId,
        mileageKm: 34850,
        recordedAt: new Date('2026-10-10T08:00:00Z'),
      });
    });

    it.each([
      ['lower (back-dated log)', 30000],
      ['equal', 34500],
    ])('leaves the mileage unchanged when the odometer is %s', async (_name, odometerKm) => {
      await service.create(ALICE, vehicleId, logInput({ odometerKm }));

      expect(await mileage()).toBe(34500);
      expect(readings.readings).toHaveLength(0);
    });

    it('rejects a fueledAt more than 1 minute in the future', async () => {
      const fueledAt = new Date(NOW.getTime() + 60_001).toISOString();

      expect(
        await validationDetails(service.create(ALICE, vehicleId, logInput({ fueledAt }))),
      ).toEqual({ fueledAt: ['Must not be in the future'] });
      expect(logs.logs.size).toBe(0);
    });

    it('accepts a fueledAt up to 1 minute in the future (clock skew)', async () => {
      const fueledAt = new Date(NOW.getTime() + 60_000).toISOString();

      await expect(service.create(ALICE, vehicleId, logInput({ fueledAt }))).resolves.toBeDefined();
    });

    it("returns 404 for another user's vehicle", async () => {
      await expect(service.create(BOB, vehicleId, logInput())).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('list', () => {
    it('orders by fueledAt desc, then createdAt desc, with economies over the whole history', async () => {
      const create = async (fueledAt: string, odometerKm: number, volume: number) =>
        (await service.create(ALICE, vehicleId, logInput({ fueledAt, odometerKm, volume }))).id;
      const oldest = await create('2026-01-01T00:00:00Z', 1000, 40);
      const middle = await create('2026-05-01T00:00:00Z', 1500, 30);
      const sameDayLater = await create('2026-05-01T00:00:00Z', 1500, 10);
      const newest = await create('2026-09-01T00:00:00Z', 2000, 25);

      const list = await service.list(ALICE, vehicleId);

      expect(list.map((log) => log.id)).toEqual([newest, sameDayLater, middle, oldest]);
      expect(list.map((log) => log.economy)).toEqual([5, null, 6, null]);
    });

    it('returns at most 50 logs', async () => {
      for (let i = 0; i < 51; i++) {
        await service.create(ALICE, vehicleId, logInput({ odometerKm: 1000 }));
      }

      expect(await service.list(ALICE, vehicleId)).toHaveLength(50);
    });

    it('only returns logs of that vehicle', async () => {
      const other = await vehicleService.create(ALICE, vehicleInput('222', 0));
      await service.create(ALICE, other.id, logInput({ odometerKm: 10 }));

      expect(await service.list(ALICE, vehicleId)).toEqual([]);
    });

    it("returns 404 for another user's vehicle", async () => {
      await expect(service.list(BOB, vehicleId)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('getById', () => {
    it('returns the log', async () => {
      const created = await service.create(ALICE, vehicleId, logInput());

      expect(await service.getById(ALICE, vehicleId, created.id)).toEqual(created);
    });

    it.each([
      ['a malformed id', 'nope'],
      ['an unknown id', '0'.repeat(24)],
    ])('returns 404 for %s', async (_name, id) => {
      await expect(service.getById(ALICE, vehicleId, id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("returns 404 for another vehicle's log", async () => {
      const other = await vehicleService.create(ALICE, vehicleInput('222', 0));
      const created = await service.create(ALICE, other.id, logInput({ odometerKm: 10 }));

      await expect(service.getById(ALICE, vehicleId, created.id)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it("returns 404 for another user's vehicle", async () => {
      const created = await service.create(ALICE, vehicleId, logInput());

      await expect(service.getById(BOB, vehicleId, created.id)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('update', () => {
    it('changes only the given fields and recomputes the economy', async () => {
      await service.create(ALICE, vehicleId, logInput({ odometerKm: 34000, volume: 40 }));
      const created = await service.create(
        ALICE,
        vehicleId,
        logInput({ fueledAt: '2026-10-12T08:00:00Z', odometerKm: 34500, volume: 37.3 }),
      );

      const updated = await service.update(ALICE, vehicleId, created.id, {
        volume: 50,
        station: 'جایگاه ۲۴',
        notes: null,
      });

      expect(updated).toMatchObject({
        id: created.id,
        odometerKm: 34500,
        volume: 50,
        station: 'جایگاه ۲۴',
        notes: null,
        economy: 10,
      });
    });

    it('raises the mileage when the new odometer is higher, and not when lower', async () => {
      const created = await service.create(ALICE, vehicleId, logInput({ odometerKm: 34850 }));

      await service.update(ALICE, vehicleId, created.id, { odometerKm: 36000 });
      expect(await mileage()).toBe(36000);

      await service.update(ALICE, vehicleId, created.id, { odometerKm: 20000 });
      expect(await mileage()).toBe(36000);
    });

    it('rejects a future fueledAt', async () => {
      const created = await service.create(ALICE, vehicleId, logInput());

      expect(
        await validationDetails(
          service.update(ALICE, vehicleId, created.id, { fueledAt: '2030-01-01T00:00:00Z' }),
        ),
      ).toEqual({ fueledAt: ['Must not be in the future'] });
    });

    it("returns 404 for another user's vehicle", async () => {
      const created = await service.create(ALICE, vehicleId, logInput());

      await expect(
        service.update(BOB, vehicleId, created.id, { volume: 1 }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('remove', () => {
    it('deletes the log, leaves the mileage unchanged and resets neighbouring economies', async () => {
      const first = await service.create(ALICE, vehicleId, logInput({ odometerKm: 34000 }));
      const second = await service.create(
        ALICE,
        vehicleId,
        logInput({ fueledAt: '2026-10-12T08:00:00Z', odometerKm: 40000 }),
      );
      expect(second.economy).not.toBeNull();

      await service.remove(ALICE, vehicleId, first.id);

      expect(logs.logs.size).toBe(1);
      expect(await mileage()).toBe(40000);
      expect((await service.getById(ALICE, vehicleId, second.id)).economy).toBeNull();
    });

    it('returns 404 for an unknown id', async () => {
      await expect(service.remove(ALICE, vehicleId, '0'.repeat(24))).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });
});
