import { beforeEach, describe, expect, it } from 'vitest';
import { createGarage, type Garage } from '../../test/garage-fixture.ts';
import { HistoryService } from '../history/history.service.ts';
import { SERVICE_INTERVALS } from '../service-intervals/service-interval.data.ts';
import { ServiceIntervalService } from '../service-intervals/service-interval.service.ts';
import { SERVICE_ITEMS } from '../service-items/service-items.data.ts';
import { ServiceItemCatalog } from '../service-items/service-items.ts';
import { DashboardService } from './dashboard.service.ts';

const ALICE = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BOB = 'bbbbbbbbbbbbbbbbbbbbbbbb';
// 25 Mehr 1405 in Tehran. 1405 starts at 2026-03-20T20:30Z; Mehr at 2026-09-22T20:30Z.
const NOW = new Date('2026-10-17T10:00:00Z');
const YEAR_START = '2026-03-20T20:30:00.000Z';
const MEHR_START = '2026-09-22T20:30:00.000Z';

const before = (iso: string) => new Date(new Date(iso).getTime() - 1).toISOString();

/** Wired like `createApp`, over the garage's in-memory repositories. */
function createDashboardService(garage: Garage, now: Date): DashboardService {
  const r = garage.repositories;
  return new DashboardService({
    vehicles: garage.vehicleService,
    history: new HistoryService({
      vehicles: garage.vehicleService,
      visits: r.serviceVisitRepository,
      invoices: r.serviceInvoiceRepository,
      fuelLogs: r.fuelLogRepository,
      expenses: r.expenseRepository,
      attachments: r.expenseAttachmentRepository,
      items: new ServiceItemCatalog(SERVICE_ITEMS),
    }),
    intervals: new ServiceIntervalService({
      definitions: SERVICE_INTERVALS,
      overrides: r.serviceIntervalRepository,
      vehicles: garage.vehicleService,
      visits: r.serviceVisitRepository,
      readings: r.odometerReadingRepository,
      now: () => now,
    }),
    now: () => now,
  });
}

describe('DashboardService', () => {
  let garage: Garage;
  let service: DashboardService;

  beforeEach(() => {
    garage = createGarage(NOW);
    service = createDashboardService(garage, NOW);
  });

  it('is all zeros for an empty garage, still with 6 months', async () => {
    const dashboard = await service.get(ALICE);

    expect(dashboard).toMatchObject({
      jalaliYear: 1405,
      yearTotalCost: 0,
      invoiceCount: 0,
      attentionCount: 0,
      vehicles: [],
    });
    expect(dashboard.months).toHaveLength(6);
    expect(dashboard.months.every((m) => m.totalCost === 0 && m.byVehicle.length === 0)).toBe(true);
  });

  it('lists the last 6 Jalali months oldest first, each ending where the next starts', async () => {
    const { months } = await service.get(ALICE);

    expect(months.map((m) => [m.jalaliYear, m.jalaliMonth])).toEqual([
      [1405, 2],
      [1405, 3],
      [1405, 4],
      [1405, 5],
      [1405, 6],
      [1405, 7],
    ]);
    expect(months[0]!.from.toISOString()).toBe('2026-04-20T20:30:00.000Z');
    expect(months[5]!.from.toISOString()).toBe(MEHR_START);
    expect(months[5]!.to.toISOString()).toBe('2026-10-22T20:30:00.000Z');
    for (let i = 1; i < months.length; i++) expect(months[i]!.from).toEqual(months[i - 1]!.to);
  });

  it('crosses into the previous Jalali year early in the year', async () => {
    // 10 Ordibehesht 1405.
    const early = createDashboardService(garage, new Date('2026-04-30T10:00:00Z'));
    const { months } = await early.get(ALICE);
    expect(months.map((m) => [m.jalaliYear, m.jalaliMonth])).toEqual([
      [1404, 9],
      [1404, 10],
      [1404, 11],
      [1404, 12],
      [1405, 1],
      [1405, 2],
    ]);
  });

  it('buckets costs by month at the Tehran-midnight boundary, per vehicle in garage order', async () => {
    const first = await garage.addVehicle(ALICE, '345');
    const second = await garage.addVehicle(ALICE, '346');
    await garage.addFuel(first, MEHR_START, { totalCost: 100 });
    await garage.addExpense(second, before(MEHR_START), { amount: 20 });
    await garage.addService(second, '2026-10-01T08:00:00Z', { battery: 3 });

    const { vehicles, months } = await service.get(ALICE);
    const [shahrivar, mehr] = months.slice(-2);
    const order = vehicles.map((v) => v.vehicleId);

    expect(order).toEqual((await garage.vehicleService.list(ALICE)).map((v) => v.id));
    expect(mehr!.totalCost).toBe(103);
    expect(mehr!.byVehicle).toEqual(
      order.map((vehicleId) => ({ vehicleId, totalCost: vehicleId === first ? 100 : 3 })),
    );
    expect(shahrivar!.totalCost).toBe(20);
    expect(shahrivar!.byVehicle).toEqual(
      order.map((vehicleId) => ({ vehicleId, totalCost: vehicleId === second ? 20 : 0 })),
    );
  });

  it('totals the current Jalali year from Nowruz to now', async () => {
    const car = await garage.addVehicle(ALICE);
    await garage.addFuel(car, before(YEAR_START), { totalCost: 1 });
    await garage.addFuel(car, YEAR_START, { totalCost: 10 });
    await garage.addExpense(car, '2026-06-01T08:00:00Z', { amount: 200 });

    const dashboard = await service.get(ALICE);

    expect(dashboard.yearTotalCost).toBe(210);
    expect(dashboard.vehicles).toEqual([
      expect.objectContaining({ vehicleId: car, yearTotalCost: 210 }),
    ]);
  });

  it('counts invoiced visits and expenses with an attachment, all time', async () => {
    const car = await garage.addVehicle(ALICE);
    await garage.addService(car, '2020-01-01T08:00:00Z', { battery: 1 }, { invoice: true });
    await garage.addService(car, '2026-01-01T08:00:00Z', { battery: 1 });
    await garage.addExpense(car, '2021-01-01T08:00:00Z', {}, { attachment: true });
    await garage.addExpense(car, '2026-01-01T08:00:00Z');
    await garage.addFuel(car, '2026-01-01T08:00:00Z');

    expect((await service.get(ALICE)).invoiceCount).toBe(2);
  });

  it('counts overdue and due_soon items per vehicle and in total', async () => {
    // A new vehicle's baseline is its creation (2026-01-01 in the fakes): the two 6-month
    // intervals (engine oil, air filter) are overdue by NOW; everything else is further out.
    const car = await garage.addVehicle(ALICE, '345');
    const fresh = await garage.addVehicle(ALICE, '346');
    await garage.addService(car, '2026-10-10T08:00:00Z', { engine_oil: 1 }, { odometerKm: 34500 });

    const dashboard = await service.get(ALICE);

    expect(dashboard.vehicles.find((v) => v.vehicleId === car)?.attentionCount).toBe(1);
    expect(dashboard.vehicles.find((v) => v.vehicleId === fresh)?.attentionCount).toBe(2);
    expect(dashboard.attentionCount).toBe(3);
  });

  it("ignores another user's vehicles", async () => {
    const bobs = await garage.addVehicle(BOB, '999');
    await garage.addFuel(bobs, '2026-10-01T08:00:00Z');
    expect(await service.get(ALICE)).toMatchObject({ yearTotalCost: 0, vehicles: [] });
  });
});
