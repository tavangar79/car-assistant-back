import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError } from '../../shared/errors.ts';
import { parseOrThrow } from '../../shared/validate.ts';
import { createGarage, type Garage } from '../../test/garage-fixture.ts';
import { SERVICE_ITEMS } from '../service-items/service-items.data.ts';
import { ServiceItemCatalog } from '../service-items/service-items.ts';
import { HistoryService } from './history.service.ts';
import { historyQuerySchema, type HistoryEntry } from './history.types.ts';

const ALICE = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BOB = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const NOW = new Date('2026-10-17T10:00:00Z');

/** The query as the route would parse it from a query string. */
const query = (raw: Record<string, string> = {}) => parseOrThrow(historyQuerySchema, raw);
const ids = (entries: HistoryEntry[]) => entries.map((entry) => entry.id);

describe('HistoryService', () => {
  let garage: Garage;
  let service: HistoryService;
  let car: string;

  beforeEach(async () => {
    garage = createGarage(NOW);
    const { repositories: r } = garage;
    service = new HistoryService({
      vehicles: garage.vehicleService,
      visits: r.serviceVisitRepository,
      invoices: r.serviceInvoiceRepository,
      fuelLogs: r.fuelLogRepository,
      expenses: r.expenseRepository,
      attachments: r.expenseAttachmentRepository,
      items: new ServiceItemCatalog(SERVICE_ITEMS),
    });
    car = await garage.addVehicle(ALICE);
  });

  it('returns an empty first page with zero totals', async () => {
    expect(await service.list(ALICE, query())).toEqual({
      entries: [],
      nextCursor: null,
      summary: { totalCost: 0, serviceCount: 0, fuelVolume: 0, entryCount: 0 },
    });
  });

  it('merges all three kinds, newest first, with cost and attachment flags', async () => {
    const serviceId = await garage.addService(
      car,
      '2026-03-01T08:00:00Z',
      { engine_oil: 1850000, oil_filter: 280000 },
      { invoice: true },
    );
    const fuelId = await garage.addFuel(car, '2026-05-01T08:00:00Z', { totalCost: 145500 });
    const expenseId = await garage.addExpense(car, '2026-04-01T08:00:00Z', { amount: 5850000 });

    const { entries } = await service.list(ALICE, query());

    expect(
      entries.map(({ type, id, cost, hasAttachment }) => ({ type, id, cost, hasAttachment })),
    ).toEqual([
      { type: 'fuel', id: fuelId, cost: 145500, hasAttachment: false },
      { type: 'expense', id: expenseId, cost: 5850000, hasAttachment: false },
      { type: 'service', id: serviceId, cost: 2130000, hasAttachment: true },
    ]);
    const [fuel, expense, visit] = entries;
    expect(fuel).toMatchObject({ service: null, expense: null, fuelLog: { id: fuelId } });
    expect(expense).toMatchObject({ service: null, fuelLog: null, expense: { id: expenseId } });
    expect(visit).toMatchObject({
      vehicleId: car,
      occurredAt: new Date('2026-03-01T08:00:00Z'),
      fuelLog: null,
      expense: null,
      service: { id: serviceId, totalCost: 2130000, invoiceUrl: expect.any(String) },
    });
  });

  it('computes fuel economy from every log of the vehicle, not only the filtered ones', async () => {
    await garage.addFuel(car, '2026-01-01T08:00:00Z', { odometerKm: 30000, isFullFill: true });
    const later = await garage.addFuel(car, '2026-02-01T08:00:00Z', {
      odometerKm: 30500,
      volume: 40,
      isFullFill: true,
    });

    const { entries } = await service.list(ALICE, query({ from: '2026-01-15T00:00:00Z' }));

    expect(ids(entries)).toEqual([later]);
    expect(entries[0]!.fuelLog!.economy).toBe(8);
  });

  describe('filters', () => {
    let oilChange: string;
    let brakes: string;
    let fuel: string;
    let insurance: string;
    let other: string;

    beforeEach(async () => {
      oilChange = await garage.addService(
        car,
        '2026-01-10T08:00:00Z',
        { engine_oil: 100 },
        { invoice: true },
      );
      brakes = await garage.addService(car, '2026-02-10T08:00:00Z', { front_brake_pads: 200 });
      fuel = await garage.addFuel(car, '2026-03-10T08:00:00Z', { totalCost: 300 });
      insurance = await garage.addExpense(
        car,
        '2026-04-10T08:00:00Z',
        { amount: 400 },
        { attachment: true },
      );
      other = await garage.addExpense(car, '2026-05-10T08:00:00Z', {
        amount: 500,
        category: 'other',
      });
    });

    it.each([
      ['service', () => [brakes, oilChange]],
      ['fuel', () => [fuel]],
      ['expense', () => [other, insurance]],
      ['all', () => [other, insurance, fuel, brakes, oilChange]],
    ] as const)('type=%s keeps only that kind', async (type, expected) => {
      expect(ids((await service.list(ALICE, query({ type }))).entries)).toEqual(expected());
    });

    it('categories keeps visits with an item in the set and drops fuel', async () => {
      const { entries } = await service.list(ALICE, query({ categories: 'brakes' }));
      expect(ids(entries)).toEqual([brakes]);
    });

    it('legal keeps every expense except "other"', async () => {
      const { entries } = await service.list(ALICE, query({ categories: 'legal,fluids' }));
      expect(ids(entries)).toEqual([insurance, oilChange]);
    });

    it('hasAttachment=true keeps invoiced visits and expenses with a file', async () => {
      const { entries } = await service.list(ALICE, query({ hasAttachment: 'true' }));
      expect(ids(entries)).toEqual([insurance, oilChange]);
    });

    it('hasAttachment=false keeps the entries without one, fuel included', async () => {
      const { entries } = await service.list(ALICE, query({ hasAttachment: 'false' }));
      expect(ids(entries)).toEqual([other, fuel, brakes]);
    });

    it('from and to are inclusive on the record date', async () => {
      const { entries } = await service.list(
        ALICE,
        query({ from: '2026-02-10T08:00:00Z', to: '2026-04-10T08:00:00Z' }),
      );
      expect(ids(entries)).toEqual([insurance, fuel, brakes]);
    });

    it('combines filters', async () => {
      const { entries, summary } = await service.list(
        ALICE,
        query({ type: 'service', categories: 'fluids,brakes', hasAttachment: 'true' }),
      );
      expect(ids(entries)).toEqual([oilChange]);
      expect(summary).toEqual({ totalCost: 100, serviceCount: 1, fuelVolume: 0, entryCount: 1 });
    });
  });

  describe('vehicles', () => {
    it('covers every vehicle of the caller by default, and only the listed ones otherwise', async () => {
      const second = await garage.addVehicle(ALICE, '346');
      const first = await garage.addFuel(car, '2026-01-01T08:00:00Z');
      const other = await garage.addFuel(second, '2026-02-01T08:00:00Z');

      expect(ids((await service.list(ALICE, query())).entries)).toEqual([other, first]);
      expect(ids((await service.list(ALICE, query({ vehicleIds: car }))).entries)).toEqual([first]);
    });

    it("is not found for another user's vehicle or a malformed id", async () => {
      const bobs = await garage.addVehicle(BOB, '999');
      await expect(service.list(ALICE, query({ vehicleIds: `${car},${bobs}` }))).rejects.toThrow(
        NotFoundError,
      );
      await expect(service.list(ALICE, query({ vehicleIds: 'nope' }))).rejects.toThrow(
        NotFoundError,
      );
    });

    it("never shows another user's records", async () => {
      const bobs = await garage.addVehicle(BOB, '999');
      await garage.addFuel(bobs, '2026-01-01T08:00:00Z');
      expect((await service.list(ALICE, query())).entries).toEqual([]);
    });
  });

  describe('pagination', () => {
    it('pages across mixed kinds with equal timestamps by id desc, with no gaps or repeats', async () => {
      const at = '2026-06-01T08:00:00Z';
      const all = [
        await garage.addService(car, at, { engine_oil: 1 }),
        await garage.addFuel(car, at),
        await garage.addExpense(car, at),
        await garage.addService(car, at, { coolant: 1 }),
        await garage.addFuel(car, '2026-05-01T08:00:00Z'),
      ];
      const expected = [...all.slice(0, 4)].sort().reverse().concat(all[4]!);

      const first = await service.list(ALICE, query({ limit: '2' }));
      const second = await service.list(ALICE, query({ limit: '2', cursor: first.nextCursor! }));
      const third = await service.list(ALICE, query({ limit: '2', cursor: second.nextCursor! }));

      expect([first, second, third].flatMap((page) => ids(page.entries))).toEqual(expected);
      expect(third.nextCursor).toBeNull();
      expect(second.summary).toBeNull();
      expect(third.summary).toBeNull();
    });

    it('has no next cursor when the last page is exactly full', async () => {
      await garage.addFuel(car, '2026-01-01T08:00:00Z');
      await garage.addFuel(car, '2026-02-01T08:00:00Z');
      expect((await service.list(ALICE, query({ limit: '2' }))).nextCursor).toBeNull();
    });
  });

  it('summarises the whole filtered set, not just the page', async () => {
    await garage.addService(car, '2026-01-01T08:00:00Z', { engine_oil: 1000, coolant: 500 });
    await garage.addService(car, '2026-02-01T08:00:00Z', { battery: 2000 });
    await garage.addFuel(car, '2026-03-01T08:00:00Z', { volume: 40.25, totalCost: 100 });
    await garage.addFuel(car, '2026-03-02T08:00:00Z', { volume: 10.11, totalCost: 200 });
    await garage.addFuel(car, '2026-03-03T08:00:00Z', {
      volume: 15,
      totalCost: 300,
      fuelType: 'cng',
    });
    await garage.addExpense(car, '2026-04-01T08:00:00Z', { amount: 4000 });

    const page = await service.list(ALICE, query({ limit: '1' }));

    expect(page.entries).toHaveLength(1);
    expect(page.summary).toEqual({
      totalCost: 1500 + 2000 + 100 + 200 + 300 + 4000,
      serviceCount: 2,
      fuelVolume: 50.4,
      entryCount: 6,
    });
  });
});
