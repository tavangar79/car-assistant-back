import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '../../shared/errors.ts';
import { InMemoryOdometerReadingRepository } from '../../test/in-memory-odometer.repository.ts';
import { InMemoryServiceIntervalRepository } from '../../test/in-memory-service-interval.repository.ts';
import { InMemoryServiceInvoiceRepository } from '../../test/in-memory-service-invoice.repository.ts';
import { InMemoryServiceVisitRepository } from '../../test/in-memory-service-visit.repository.ts';
import { InMemoryVehiclePhotoRepository } from '../../test/in-memory-vehicle-photo.repository.ts';
import { InMemoryVehicleRepository } from '../../test/in-memory-vehicle.repository.ts';
import { VEHICLE_CATALOG } from '../vehicle-catalog/vehicle-catalog.data.ts';
import { VehicleCatalog } from '../vehicle-catalog/vehicle-catalog.ts';
import { VehicleService } from '../vehicles/vehicle.service.ts';
import type { CreateVehicleInput } from '../vehicles/vehicle.types.ts';
import { SERVICE_INTERVALS } from './service-interval.data.ts';
import { ServiceIntervalService } from './service-interval.service.ts';

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

describe('ServiceIntervalService', () => {
  let overrides: InMemoryServiceIntervalRepository;
  let visits: InMemoryServiceVisitRepository;
  let readings: InMemoryOdometerReadingRepository;
  let vehicleService: VehicleService;
  let service: ServiceIntervalService;
  let vehicleId: string;

  beforeEach(async () => {
    const vehicles = new InMemoryVehicleRepository();
    overrides = new InMemoryServiceIntervalRepository();
    visits = new InMemoryServiceVisitRepository();
    readings = new InMemoryOdometerReadingRepository(vehicles);
    vehicleService = new VehicleService({
      vehicles,
      photos: new InMemoryVehiclePhotoRepository(),
      readings,
      serviceVisits: visits,
      serviceInvoices: new InMemoryServiceInvoiceRepository(),
      serviceIntervals: overrides,
      catalog: new VehicleCatalog(VEHICLE_CATALOG),
      now: () => NOW,
    });
    service = new ServiceIntervalService({
      definitions: SERVICE_INTERVALS,
      overrides,
      vehicles: vehicleService,
      visits,
      readings,
      now: () => NOW,
    });
    vehicleId = (await vehicleService.create(ALICE, vehicleInput('345', 34500))).id;
  });

  const addVisit = (
    serviceDate: string,
    odometerKm: number,
    itemId: string,
    nextDueKm: number | null = null,
  ) =>
    visits.create({
      vehicleId,
      serviceDate: new Date(serviceDate),
      odometerKm,
      workshop: 'x',
      notes: null,
      lineItems: [{ itemId, brand: null, cost: 0, notes: null, nextDueKm, nextDueMonths: null }],
      totalCost: 0,
    });

  describe('list', () => {
    it('returns all 8 intervals with factory defaults, in catalog order', async () => {
      const intervals = await service.list(ALICE, vehicleId);

      expect(intervals.map((i) => i.id)).toEqual(SERVICE_INTERVALS.map((d) => d.id));
      expect(intervals[0]).toEqual({
        id: 'engine_oil',
        title: 'روغن موتور و فیلتر روغن',
        description: 'تعویض روغن موتور به همراه فیلتر روغن',
        icon: 'oil_barrel',
        coversItemIds: ['engine_oil', 'oil_filter'],
        km: 5000,
        months: 6,
        defaultKm: 5000,
        defaultMonths: 6,
        isCustom: false,
      });
    });

    it("returns 404 for another user's vehicle", async () => {
      await expect(service.list(BOB, vehicleId)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('set', () => {
    it('overrides the listed intervals and keeps the others', async () => {
      const intervals = await service.set(ALICE, vehicleId, {
        intervals: [{ id: 'engine_oil', km: 7000, months: 6 }],
      });

      expect(intervals[0]).toMatchObject({ id: 'engine_oil', km: 7000, months: 6, isCustom: true });
      expect(intervals.slice(1).every((i) => !i.isCustom)).toBe(true);
    });

    it('removes the override when the values equal the defaults', async () => {
      await service.set(ALICE, vehicleId, {
        intervals: [{ id: 'engine_oil', km: 7000, months: 6 }],
      });

      const intervals = await service.set(ALICE, vehicleId, {
        intervals: [{ id: 'engine_oil', km: 5000, months: 6 }],
      });

      expect(intervals[0]).toMatchObject({ km: 5000, months: 6, isCustom: false });
      expect(overrides.overrides.size).toBe(0);
    });

    it('rejects unknown ids without saving anything', async () => {
      const err = await service
        .set(ALICE, vehicleId, {
          intervals: [
            { id: 'engine_oil', km: 7000, months: 6 },
            { id: 'nope', km: 7000, months: 6 },
          ],
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).details).toEqual({ intervals: ['Unknown interval: nope'] });
      expect(overrides.overrides.size).toBe(0);
    });

    it('keeps overrides per vehicle', async () => {
      const other = await vehicleService.create(ALICE, vehicleInput('222', 0));
      await service.set(ALICE, other.id, { intervals: [{ id: 'coolant', km: 20000, months: 12 }] });

      const intervals = await service.list(ALICE, vehicleId);

      expect(intervals.every((i) => !i.isCustom)).toBe(true);
    });
  });

  describe('resetAll', () => {
    it('removes every override of the vehicle', async () => {
      await service.set(ALICE, vehicleId, {
        intervals: [
          { id: 'engine_oil', km: 7000, months: 6 },
          { id: 'coolant', km: 20000, months: 12 },
        ],
      });

      const intervals = await service.resetAll(ALICE, vehicleId);

      expect(intervals.every((i) => !i.isCustom)).toBe(true);
      expect(overrides.overrides.size).toBe(0);
    });
  });

  describe('due', () => {
    it('reports asOf, the mileage and all 8 intervals', async () => {
      const report = await service.due(ALICE, vehicleId);

      expect(report.asOf).toEqual(NOW);
      expect(report.mileageKm).toBe(34500);
      expect(report.items).toHaveLength(8);
    });

    it('uses the vehicle creation as baseline without visits or readings', async () => {
      const vehicle = await vehicleService.getById(ALICE, vehicleId);

      const { items } = await service.due(ALICE, vehicleId);
      const engineOil = items.find((i) => i.intervalId === 'engine_oil')!;

      expect(engineOil).toMatchObject({
        baselineKm: 34500,
        baselineDate: vehicle.createdAt,
        baselineServiceId: null,
        dueKm: 39500,
        remainingKm: 5000,
      });
    });

    it('uses the earliest odometer reading as baseline when there are readings but no visits', async () => {
      await readings.record({
        vehicleId,
        mileageKm: 35000,
        recordedAt: new Date('2026-06-01T00:00:00Z'),
      });
      await readings.record({
        vehicleId,
        mileageKm: 36000,
        recordedAt: new Date('2026-09-01T00:00:00Z'),
      });

      const { items } = await service.due(ALICE, vehicleId);
      const engineOil = items.find((i) => i.intervalId === 'engine_oil')!;

      expect(engineOil).toMatchObject({
        baselineKm: 35000,
        baselineDate: new Date('2026-06-01T00:00:00Z'),
        baselineServiceId: null,
        dueKm: 40000,
        dueDate: new Date('2026-12-01T00:00:00Z'),
        remainingKm: 4000,
        remainingDays: 44,
        status: 'ok',
      });
    });

    it('uses the covering visit as baseline, with the vehicle override', async () => {
      await service.set(ALICE, vehicleId, {
        intervals: [{ id: 'engine_oil', km: 7000, months: 6 }],
      });
      const visit = await addVisit('2026-10-01T00:00:00Z', 30000, 'oil_filter');

      const { items } = await service.due(ALICE, vehicleId);
      const engineOil = items.find((i) => i.intervalId === 'engine_oil')!;

      expect(engineOil).toMatchObject({
        baselineKm: 30000,
        baselineServiceId: visit.id,
        dueKm: 37000,
        remainingKm: 2500,
        status: 'ok',
      });
    });

    it('lets the sticker reminder on the visit replace the interval', async () => {
      await addVisit('2026-10-01T00:00:00Z', 30000, 'engine_oil', 4000);

      const { items } = await service.due(ALICE, vehicleId);

      expect(items[0]).toMatchObject({
        intervalId: 'engine_oil',
        dueKm: 34000,
        remainingKm: -500,
        status: 'overdue',
      });
    });

    it("returns 404 for another user's vehicle", async () => {
      await expect(service.due(BOB, vehicleId)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
