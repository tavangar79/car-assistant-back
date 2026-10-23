import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError } from '../../shared/errors.ts';
import { parseOrThrow } from '../../shared/validate.ts';
import { createGarage, type Garage } from '../../test/garage-fixture.ts';
import { HistoryService } from '../history/history.service.ts';
import { ServiceItemCatalog } from '../service-items/service-items.ts';
import { REPORT_TOO_LARGE, ReportService } from './report.service.ts';
import { reportQuerySchema, type Report } from './report.types.ts';

const ALICE = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BOB = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const NOW = new Date('2026-10-17T10:00:00Z');

/** The query as the route would parse it from a query string. */
const query = (raw: Record<string, string> = {}) => parseOrThrow(reportQuerySchema, raw);
const ids = (report: Report) => report.entries.map((entry) => entry.id);

describe('ReportService', () => {
  let garage: Garage;
  let car: string;

  const reportService = (maxEntries = 5000) => {
    const { repositories: r } = garage;
    const history = new HistoryService({
      vehicles: garage.vehicleService,
      visits: r.serviceVisitRepository,
      invoices: r.serviceInvoiceRepository,
      fuelLogs: r.fuelLogRepository,
      expenses: r.expenseRepository,
      attachments: r.expenseAttachmentRepository,
      items: new ServiceItemCatalog({
        definitions: r.serviceItemDefRepository,
        vehicles: garage.vehicleService,
      }),
    });
    return new ReportService({ history, maxEntries });
  };

  beforeEach(async () => {
    garage = createGarage(NOW);
    car = await garage.addVehicle(ALICE);
  });

  it('returns no entries and zero totals for an empty garage', async () => {
    expect(await reportService().get(ALICE, query())).toEqual({
      entries: [],
      summary: { totalCost: 0, serviceCount: 0, fuelVolume: 0, entryCount: 0 },
    });
  });

  it('returns every type, oldest first, then by id on equal dates', async () => {
    const sameDate = '2024-11-15T08:00:00.000Z';
    const fuel = await garage.addFuel(car, '2024-11-16T08:00:00.000Z');
    const service = await garage.addService(car, sameDate, { engine_oil: 1000 });
    const expense = await garage.addExpense(car, sameDate);
    const oldest = await garage.addExpense(car, '2024-01-01T08:00:00.000Z');

    const report = await reportService().get(ALICE, query());

    const [first, second] = [service, expense].sort();
    expect(ids(report)).toEqual([oldest, first, second, fuel]);
  });

  it('keeps only the requested types', async () => {
    const service = await garage.addService(car, '2024-11-15T08:00:00.000Z', { engine_oil: 1000 });
    await garage.addFuel(car, '2024-11-16T08:00:00.000Z');
    const expense = await garage.addExpense(car, '2024-11-17T08:00:00.000Z');

    const report = await reportService().get(ALICE, query({ types: 'expense,service' }));

    expect(ids(report)).toEqual([service, expense]);
  });

  it('keeps only records in the inclusive date range', async () => {
    await garage.addFuel(car, '2024-10-31T23:59:59.999Z');
    const first = await garage.addFuel(car, '2024-11-01T00:00:00.000Z');
    const last = await garage.addFuel(car, '2024-11-30T00:00:00.000Z');
    await garage.addFuel(car, '2024-11-30T00:00:00.001Z');

    const report = await reportService().get(
      ALICE,
      query({ from: '2024-11-01T00:00:00.000Z', to: '2024-11-30T00:00:00.000Z' }),
    );

    expect(ids(report)).toEqual([first, last]);
  });

  it('covers every vehicle of the caller by default and only the asked ones otherwise', async () => {
    const other = await garage.addVehicle(ALICE, '999');
    const mine = await garage.addFuel(car, '2024-11-01T00:00:00.000Z');
    const theirs = await garage.addFuel(other, '2024-11-02T00:00:00.000Z');

    expect(ids(await reportService().get(ALICE, query()))).toEqual([mine, theirs]);
    expect(ids(await reportService().get(ALICE, query({ vehicleIds: other })))).toEqual([theirs]);
  });

  it('rejects another user’s vehicle as not found', async () => {
    const bobsCar = await garage.addVehicle(BOB);
    await expect(
      reportService().get(ALICE, query({ vehicleIds: `${car},${bobsCar}` })),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('summarizes the filtered set exactly like history', async () => {
    await garage.addService(car, '2024-11-15T08:00:00.000Z', { engine_oil: 1000, oil_filter: 500 });
    await garage.addFuel(car, '2024-11-16T08:00:00.000Z', { volume: 40.25, totalCost: 100 });
    await garage.addFuel(car, '2024-11-17T08:00:00.000Z', { fuelType: 'cng', volume: 9 });
    await garage.addExpense(car, '2024-11-18T08:00:00.000Z', { amount: 7000 });

    const { summary } = await reportService().get(ALICE, query({ types: 'service,fuel' }));

    expect(summary).toEqual({
      totalCost: 1500 + 100 + 120000,
      serviceCount: 1,
      fuelVolume: 40.3,
      entryCount: 3,
    });
  });

  it('rejects more matching entries than the cap with 422', async () => {
    await garage.addFuel(car, '2024-11-01T00:00:00.000Z');
    await garage.addFuel(car, '2024-11-02T00:00:00.000Z');
    await garage.addFuel(car, '2024-11-03T00:00:00.000Z');

    await expect(reportService(2).get(ALICE, query())).rejects.toMatchObject({
      statusCode: 422,
      message: REPORT_TOO_LARGE,
    });
    expect((await reportService(3).get(ALICE, query())).entries).toHaveLength(3);
  });

  it('counts only entries that match the filters against the cap', async () => {
    await garage.addFuel(car, '2024-11-01T00:00:00.000Z');
    await garage.addFuel(car, '2024-11-02T00:00:00.000Z');
    const expense = await garage.addExpense(car, '2024-11-03T00:00:00.000Z');

    const report = await reportService(1).get(ALICE, query({ types: 'expense' }));

    expect(ids(report)).toEqual([expense]);
  });
});

describe('reportQuerySchema', () => {
  it('accepts an absent types as all types', () => {
    expect(query().types).toBeUndefined();
  });

  it('parses and de-duplicates types', () => {
    expect(query({ types: 'fuel, service,fuel' }).types).toEqual(['fuel', 'service']);
  });

  it.each(['', ',', 'fuel,odometer', 'all'])('rejects types=%j under details.types', (types) => {
    expect(() => query({ types })).toThrow(
      expect.objectContaining({ statusCode: 400, details: { types: [expect.any(String)] } }),
    );
  });

  it('rejects from after to under details.from', () => {
    expect(() =>
      query({ from: '2024-12-01T00:00:00.000Z', to: '2024-11-01T00:00:00.000Z' }),
    ).toThrow(expect.objectContaining({ details: { from: ['Must not be after to'] } }));
  });
});
