import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '../../shared/errors.ts';
import { JPEG_BYTES, PNG_BYTES, WEBP_BYTES } from '../../test/image-fixtures.ts';
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
import type { InMemoryServiceItemDefRepository } from '../../test/in-memory-service-item-def.repository.ts';
import { seededServiceItemDefs } from '../../test/test-dependencies.ts';
import { globalServiceItemRows } from '../service-catalog/catalog-seed.ts';
import { ServiceItemCatalog } from '../service-items/service-items.ts';
import { VEHICLE_CATALOG } from '../vehicle-catalog/vehicle-catalog.data.ts';
import { VehicleCatalog } from '../vehicle-catalog/vehicle-catalog.ts';
import { OdometerService } from '../vehicles/odometer.service.ts';
import { VehicleService } from '../vehicles/vehicle.service.ts';
import type { CreateVehicleInput } from '../vehicles/vehicle.types.ts';
import { SERVICE_INVOICE_BAD_TYPE, ServiceVisitService } from './service-visit.service.ts';
import type { CreateServiceVisitInput } from './service-visit.types.ts';

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

function visitInput(overrides: Partial<CreateServiceVisitInput> = {}): CreateServiceVisitInput {
  return {
    serviceDate: '2026-10-10T08:00:00Z',
    odometerKm: 34850,
    workshop: 'اتوسرویس البرز',
    notes: null,
    lineItems: [
      {
        itemId: 'engine_oil',
        brand: 'بهران رانا 5W-40',
        cost: 1850000,
        nextDueKm: 7000,
        nextDueMonths: 6,
      },
      { itemId: 'oil_filter', brand: 'سرکان', cost: 280000 },
    ],
    ...overrides,
  };
}

const globalItem = (itemId: string) =>
  globalServiceItemRows().find((row) => row.itemId === itemId)!;

async function validationDetails(promise: Promise<unknown>): Promise<unknown> {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ValidationError);
  return (err as ValidationError).details;
}

describe('ServiceVisitService', () => {
  let readings: InMemoryOdometerReadingRepository;
  let visits: InMemoryServiceVisitRepository;
  let invoices: InMemoryServiceInvoiceRepository;
  let vehicleService: VehicleService;
  let itemDefs: InMemoryServiceItemDefRepository;
  let service: ServiceVisitService;
  let vehicleId: string;

  beforeEach(async () => {
    const vehicles = new InMemoryVehicleRepository();
    readings = new InMemoryOdometerReadingRepository(vehicles);
    visits = new InMemoryServiceVisitRepository();
    invoices = new InMemoryServiceInvoiceRepository();
    itemDefs = seededServiceItemDefs();
    vehicleService = new VehicleService({
      vehicles,
      photos: new InMemoryVehiclePhotoRepository(),
      readings,
      serviceVisits: visits,
      serviceInvoices: invoices,
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
    service = new ServiceVisitService({
      visits,
      invoices,
      vehicles: vehicleService,
      odometer: new OdometerService({ readings, vehicles: vehicleService, now: () => NOW }),
      items: new ServiceItemCatalog({ definitions: itemDefs, vehicles: vehicleService }),
      now: () => NOW,
    });
    vehicleId = (await vehicleService.create(ALICE, vehicleInput('345', 34500))).id;
  });

  /** A disabled model-scoped override for the test vehicle (Iran Khodro Tara). */
  const disableForTara = (itemId: string) =>
    itemDefs.create({
      ...globalItem(itemId),
      makeId: 'iran-khodro',
      modelId: 'tara',
      disabled: true,
    });

  const mileage = async () => (await vehicleService.getById(ALICE, vehicleId)).mileageKm;

  describe('create', () => {
    it('saves the visit with normalised line items, the total and no invoice', async () => {
      const visit = await service.create(ALICE, vehicleId, visitInput());

      expect(visit).toEqual({
        id: expect.stringMatching(/^[a-f\d]{24}$/),
        vehicleId,
        serviceDate: new Date('2026-10-10T08:00:00Z'),
        odometerKm: 34850,
        workshop: 'اتوسرویس البرز',
        notes: null,
        lineItems: [
          {
            itemId: 'engine_oil',
            brand: 'بهران رانا 5W-40',
            cost: 1850000,
            notes: null,
            nextDueKm: 7000,
            nextDueMonths: 6,
          },
          {
            itemId: 'oil_filter',
            brand: 'سرکان',
            cost: 280000,
            notes: null,
            nextDueKm: null,
            nextDueMonths: null,
          },
        ],
        totalCost: 2130000,
        invoice: null,
        invoiceUrl: null,
        locked: false,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it('raises the vehicle mileage with a reading dated serviceDate when the odometer is higher', async () => {
      await service.create(ALICE, vehicleId, visitInput({ odometerKm: 34850 }));

      expect(await mileage()).toBe(34850);
      expect(readings.readings).toHaveLength(1);
      expect(readings.readings[0]).toMatchObject({
        vehicleId,
        mileageKm: 34850,
        recordedAt: new Date('2026-10-10T08:00:00Z'),
      });
    });

    it.each([
      ['lower (back-dated visit)', 30000],
      ['equal', 34500],
    ])('leaves the mileage unchanged when the odometer is %s', async (_name, odometerKm) => {
      await service.create(ALICE, vehicleId, visitInput({ odometerKm }));

      expect(await mileage()).toBe(34500);
      expect(readings.readings).toHaveLength(0);
    });

    it('rejects a serviceDate more than 1 minute in the future', async () => {
      const serviceDate = new Date(NOW.getTime() + 60_001).toISOString();

      expect(
        await validationDetails(service.create(ALICE, vehicleId, visitInput({ serviceDate }))),
      ).toEqual({
        serviceDate: ['Must not be in the future'],
      });
      expect(visits.visits.size).toBe(0);
    });

    it('accepts a serviceDate up to 1 minute in the future (clock skew)', async () => {
      const serviceDate = new Date(NOW.getTime() + 60_000).toISOString();

      await expect(
        service.create(ALICE, vehicleId, visitInput({ serviceDate })),
      ).resolves.toBeDefined();
    });

    it('rejects unknown item ids under lineItems', async () => {
      const lineItems = [
        { itemId: 'nope', cost: 1 },
        { itemId: 'engine_oil', cost: 1 },
        { itemId: 'also_nope', cost: 1 },
      ];

      expect(
        await validationDetails(service.create(ALICE, vehicleId, visitInput({ lineItems }))),
      ).toEqual({
        lineItems: ['Unknown item: nope', 'Unknown item: also_nope'],
      });
    });

    it('rejects an item disabled for the vehicle, and accepts one scoped to it', async () => {
      await disableForTara('oil_filter');
      await itemDefs.create({
        ...globalItem('engine_oil'),
        itemId: 'cvt_oil',
        makeId: 'iran-khodro',
      });

      expect(await validationDetails(service.create(ALICE, vehicleId, visitInput()))).toEqual({
        lineItems: ['Item is disabled for this vehicle: oil_filter'],
      });
      const lineItems = [{ itemId: 'cvt_oil', cost: 1 }];
      await expect(
        service.create(ALICE, vehicleId, visitInput({ lineItems })),
      ).resolves.toMatchObject({ lineItems: [{ itemId: 'cvt_oil' }] });
    });

    it("returns 404 for another user's vehicle", async () => {
      await expect(service.create(BOB, vehicleId, visitInput())).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('list', () => {
    it('orders by serviceDate desc, then createdAt desc, and carries invoices', async () => {
      const create = async (serviceDate: string) =>
        (await service.create(ALICE, vehicleId, visitInput({ serviceDate, odometerKm: 1000 }))).id;
      const oldest = await create('2026-01-01T00:00:00Z');
      const middle = await create('2026-05-01T00:00:00Z');
      const sameDayLater = await create('2026-05-01T00:00:00Z');
      const newest = await create('2026-09-01T00:00:00Z');
      await service.uploadInvoice(ALICE, vehicleId, middle, { fileName: 'a.png', data: PNG_BYTES });

      const list = await service.list(ALICE, vehicleId);

      expect(list.map((v) => v.id)).toEqual([newest, sameDayLater, middle, oldest]);
      expect(list.map((v) => v.invoice !== null)).toEqual([false, false, true, false]);
    });

    it('returns at most 50 visits', async () => {
      for (let i = 0; i < 51; i++) {
        await service.create(ALICE, vehicleId, visitInput({ odometerKm: 1000 }));
      }

      expect(await service.list(ALICE, vehicleId)).toHaveLength(50);
    });

    it('only returns visits of that vehicle', async () => {
      const other = await vehicleService.create(ALICE, vehicleInput('222', 0));
      await service.create(ALICE, other.id, visitInput({ odometerKm: 10 }));

      expect(await service.list(ALICE, vehicleId)).toEqual([]);
    });

    it("returns 404 for another user's vehicle", async () => {
      await expect(service.list(BOB, vehicleId)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('getById', () => {
    it('returns the visit', async () => {
      const created = await service.create(ALICE, vehicleId, visitInput());

      expect(await service.getById(ALICE, vehicleId, created.id)).toEqual(created);
    });

    it.each([
      ['a malformed id', () => 'nope'],
      ['an unknown id', () => '0'.repeat(24)],
    ])('returns 404 for %s', async (_name, id) => {
      await expect(service.getById(ALICE, vehicleId, id())).rejects.toBeInstanceOf(NotFoundError);
    });

    it("returns 404 for another vehicle's visit", async () => {
      const other = await vehicleService.create(ALICE, vehicleInput('222', 0));
      const created = await service.create(ALICE, other.id, visitInput({ odometerKm: 10 }));

      await expect(service.getById(ALICE, vehicleId, created.id)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it("returns 404 for another user's vehicle", async () => {
      const created = await service.create(ALICE, vehicleId, visitInput());

      await expect(service.getById(BOB, vehicleId, created.id)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('update', () => {
    it('changes only the given fields and keeps the invoice', async () => {
      const created = await service.create(ALICE, vehicleId, visitInput({ notes: 'قدیمی' }));
      await service.uploadInvoice(ALICE, vehicleId, created.id, {
        fileName: 'a.png',
        data: PNG_BYTES,
      });

      const updated = await service.update(ALICE, vehicleId, created.id, {
        workshop: 'جدید',
        notes: null,
      });

      expect(updated).toMatchObject({
        id: created.id,
        workshop: 'جدید',
        notes: null,
        odometerKm: 34850,
        totalCost: 2130000,
        invoice: { fileName: 'a.png', contentType: 'image/png', sizeBytes: PNG_BYTES.length },
      });
      expect(updated.lineItems).toEqual(created.lineItems);
    });

    it('replaces the whole line item list and recomputes the total', async () => {
      const created = await service.create(ALICE, vehicleId, visitInput());

      const updated = await service.update(ALICE, vehicleId, created.id, {
        lineItems: [{ itemId: 'battery', cost: 4000000 }],
      });

      expect(updated.lineItems).toEqual([
        {
          itemId: 'battery',
          brand: null,
          cost: 4000000,
          notes: null,
          nextDueKm: null,
          nextDueMonths: null,
        },
      ]);
      expect(updated.totalCost).toBe(4000000);
    });

    it('raises the mileage when the new odometer is higher, and not when lower', async () => {
      const created = await service.create(ALICE, vehicleId, visitInput({ odometerKm: 34850 }));

      await service.update(ALICE, vehicleId, created.id, { odometerKm: 36000 });
      expect(await mileage()).toBe(36000);

      await service.update(ALICE, vehicleId, created.id, { odometerKm: 20000 });
      expect(await mileage()).toBe(36000);
    });

    it('rejects a future serviceDate and unknown items', async () => {
      const created = await service.create(ALICE, vehicleId, visitInput());

      expect(
        await validationDetails(
          service.update(ALICE, vehicleId, created.id, {
            serviceDate: '2030-01-01T00:00:00Z',
            lineItems: [{ itemId: 'nope', cost: 1 }],
          }),
        ),
      ).toEqual({ serviceDate: ['Must not be in the future'], lineItems: ['Unknown item: nope'] });
    });

    it('keeps existing line items whose item was disabled later, but rejects adding one', async () => {
      const created = await service.create(ALICE, vehicleId, visitInput());
      await disableForTara('oil_filter');
      await disableForTara('coolant');

      const updated = await service.update(ALICE, vehicleId, created.id, {
        workshop: 'دیگر',
        lineItems: [
          { itemId: 'engine_oil', cost: 10 },
          { itemId: 'oil_filter', cost: 20 },
        ],
      });
      expect(updated.lineItems.map((item) => item.itemId)).toEqual(['engine_oil', 'oil_filter']);

      expect(
        await validationDetails(
          service.update(ALICE, vehicleId, created.id, {
            lineItems: [{ itemId: 'coolant', cost: 1 }],
          }),
        ),
      ).toEqual({ lineItems: ['Item is disabled for this vehicle: coolant'] });
    });

    it("returns 404 for another user's vehicle", async () => {
      const created = await service.create(ALICE, vehicleId, visitInput());

      await expect(
        service.update(BOB, vehicleId, created.id, { workshop: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('remove', () => {
    it('deletes the visit and its invoice, leaving the mileage unchanged', async () => {
      const created = await service.create(ALICE, vehicleId, visitInput({ odometerKm: 40000 }));
      await service.uploadInvoice(ALICE, vehicleId, created.id, {
        fileName: 'a.png',
        data: PNG_BYTES,
      });

      await service.remove(ALICE, vehicleId, created.id);

      expect(visits.visits.size).toBe(0);
      expect(invoices.invoices.size).toBe(0);
      expect(await mileage()).toBe(40000);
    });

    it('returns 404 for an unknown id', async () => {
      await expect(service.remove(ALICE, vehicleId, '0'.repeat(24))).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('suggestions', () => {
    const visitAt = (
      serviceDate: string,
      workshop: string,
      lineItems: { itemId: string; brand?: string | null }[],
      vehicle = vehicleId,
    ) =>
      service.create(ALICE, vehicle, {
        serviceDate,
        odometerKm: 1000,
        workshop,
        lineItems: lineItems.map((item) => ({ ...item, cost: 0 })),
      });

    it('returns empty lists for a user without visits', async () => {
      expect(await service.suggestions(ALICE)).toEqual({ workshops: [], brands: {} });
    });

    it('orders distinct trimmed values by most recent serviceDate across all vehicles', async () => {
      const other = await vehicleService.create(ALICE, vehicleInput('222', 0));
      await visitAt('2026-01-01T00:00:00Z', 'الف', [{ itemId: 'engine_oil', brand: 'بهران' }]);
      await visitAt(
        '2026-03-01T00:00:00Z',
        ' ب ',
        [{ itemId: 'engine_oil', brand: 'الوند' }],
        other.id,
      );
      await visitAt('2026-02-01T00:00:00Z', 'الف', [
        { itemId: 'engine_oil', brand: ' بهران ' },
        { itemId: 'oil_filter', brand: 'سرکان' },
        { itemId: 'battery', brand: null },
      ]);

      expect(await service.suggestions(ALICE)).toEqual({
        workshops: ['ب', 'الف'],
        brands: { engine_oil: ['الوند', 'بهران'], oil_filter: ['سرکان'] },
      });
    });

    it('caps each list at 10', async () => {
      for (let i = 0; i < 12; i++) {
        const day = String(i + 1).padStart(2, '0');
        await visitAt(`2026-01-${day}T00:00:00Z`, `w${i}`, [
          { itemId: 'engine_oil', brand: `b${i}` },
        ]);
      }

      const { workshops, brands } = await service.suggestions(ALICE);

      expect(workshops).toHaveLength(10);
      expect(workshops[0]).toBe('w11');
      expect(brands.engine_oil).toHaveLength(10);
      expect(brands.engine_oil![0]).toBe('b11');
    });

    it("does not include other users' visits", async () => {
      const bobs = await vehicleService.create(BOB, vehicleInput('333', 0));
      await service.create(BOB, bobs.id, visitInput({ odometerKm: 10 }));

      expect(await service.suggestions(ALICE)).toEqual({ workshops: [], brands: {} });
    });
  });

  describe('invoice', () => {
    let serviceId: string;

    beforeEach(async () => {
      serviceId = (await service.create(ALICE, vehicleId, visitInput())).id;
    });

    it.each([
      ['JPEG', JPEG_BYTES, 'image/jpeg'],
      ['PNG', PNG_BYTES, 'image/png'],
      ['WebP', WEBP_BYTES, 'image/webp'],
    ])(
      'upload stores a %s invoice and returns the visit with it',
      async (_name, data, contentType) => {
        const visit = await service.uploadInvoice(ALICE, vehicleId, serviceId, {
          fileName: 'فاکتور.jpg',
          data,
        });

        expect(visit.invoice).toEqual({
          fileName: 'فاکتور.jpg',
          contentType,
          sizeBytes: data.length,
          updatedAt: expect.any(Date),
        });
        expect(visit.invoiceUrl).toBe(
          `/api/vehicles/${vehicleId}/services/${serviceId}/invoice?v=${visit.invoice!.updatedAt.getTime()}`,
        );
        expect(await service.getInvoice(ALICE, vehicleId, serviceId)).toMatchObject({
          contentType,
          data,
        });
      },
    );

    it('upload rejects bytes that are not an image', async () => {
      expect(
        await validationDetails(
          service.uploadInvoice(ALICE, vehicleId, serviceId, {
            fileName: 'x',
            data: Buffer.from('nope'),
          }),
        ),
      ).toEqual({ invoice: [SERVICE_INVOICE_BAD_TYPE] });
    });

    it('upload replaces the previous invoice with a new version', async () => {
      const first = await service.uploadInvoice(ALICE, vehicleId, serviceId, {
        fileName: 'a',
        data: PNG_BYTES,
      });

      const second = await service.uploadInvoice(ALICE, vehicleId, serviceId, {
        fileName: 'b',
        data: JPEG_BYTES,
      });

      expect(second.invoiceUrl).not.toBe(first.invoiceUrl);
      expect(invoices.invoices.size).toBe(1);
    });

    it('getInvoice returns 404 without an invoice', async () => {
      await expect(service.getInvoice(ALICE, vehicleId, serviceId)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('deleteInvoice removes it and is idempotent', async () => {
      await service.uploadInvoice(ALICE, vehicleId, serviceId, { fileName: 'a', data: PNG_BYTES });

      const visit = await service.deleteInvoice(ALICE, vehicleId, serviceId);
      const again = await service.deleteInvoice(ALICE, vehicleId, serviceId);

      expect(visit).toMatchObject({ id: serviceId, invoice: null, invoiceUrl: null });
      expect(again.invoice).toBeNull();
      expect(invoices.invoices.size).toBe(0);
    });

    it("returns 404 for another user's vehicle", async () => {
      await expect(
        service.uploadInvoice(BOB, vehicleId, serviceId, { fileName: 'a', data: PNG_BYTES }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
