import { describe, expect, it } from 'vitest';
import { computeDue, type DueInterval, type DueVisit } from './compute-due.ts';
import { SERVICE_INTERVALS } from './service-interval.data.ts';

const ASOF = new Date('2026-10-17T10:00:00Z');
const FALLBACK = { km: 10000, date: new Date('2026-01-01T00:00:00Z') };

const engineOil: DueInterval = { ...SERVICE_INTERVALS[0]!, km: 5000, months: 6 };
const frontBrakes: DueInterval = { ...SERVICE_INTERVALS[3]!, km: 25000, months: 18 };

const item = (
  itemId: string,
  nextDueKm: number | null = null,
  nextDueMonths: number | null = null,
) => ({
  itemId,
  nextDueKm,
  nextDueMonths,
});

const visit = (
  id: string,
  serviceDate: string,
  odometerKm: number,
  lineItems: DueVisit['lineItems'],
): DueVisit => ({
  id,
  serviceDate: new Date(serviceDate),
  odometerKm,
  lineItems,
});

/** One interval (engine oil, 5000 km / 6 months) with a baseline visit on 1 Jan 2026 at 30,000 km. */
function single(mileageKm: number, asOf = ASOF) {
  const [due] = computeDue({
    asOf,
    mileageKm,
    intervals: [engineOil],
    visits: [visit('v1', '2026-01-01T00:00:00Z', 30000, [item('engine_oil')])],
    fallback: FALLBACK,
  });
  return due!;
}

describe('computeDue', () => {
  describe('baseline from the latest covering visit', () => {
    it('uses the latest covering visit by serviceDate, not the newest visit overall', () => {
      const visits = [
        visit('old', '2025-06-01T00:00:00Z', 20000, [item('oil_filter')]),
        visit('latest', '2026-01-01T00:00:00Z', 30000, [item('engine_oil')]),
        visit('brakes', '2026-03-01T00:00:00Z', 32000, [item('front_brake_pads')]),
      ];

      const [due] = computeDue({
        asOf: ASOF,
        mileageKm: 32500,
        intervals: [engineOil],
        visits,
        fallback: FALLBACK,
      });

      expect(due).toMatchObject({
        intervalId: 'engine_oil',
        baselineKm: 30000,
        baselineDate: new Date('2026-01-01T00:00:00Z'),
        baselineServiceId: 'latest',
        dueKm: 35000,
        dueDate: new Date('2026-07-01T00:00:00Z'),
        remainingKm: 2500,
        remainingDays: -109,
        status: 'overdue',
      });
    });

    it('falls back to the given baseline with a null service id when no visit covers the interval', () => {
      const visits = [visit('brakes', '2026-03-01T00:00:00Z', 32000, [item('front_brake_pads')])];

      const [due] = computeDue({
        asOf: ASOF,
        mileageKm: 12000,
        intervals: [engineOil],
        visits,
        fallback: FALLBACK,
      });

      expect(due).toMatchObject({
        baselineKm: 10000,
        baselineDate: FALLBACK.date,
        baselineServiceId: null,
        dueKm: 15000,
        dueDate: new Date('2026-07-01T00:00:00Z'),
        remainingKm: 3000,
      });
    });
  });

  describe('sticker override', () => {
    it('replaces km and months with the covering line item reminder for this cycle', () => {
      const visits = [visit('v1', '2026-01-01T00:00:00Z', 30000, [item('engine_oil', 7000, 12)])];

      const [due] = computeDue({
        asOf: ASOF,
        mileageKm: 30000,
        intervals: [engineOil],
        visits,
        fallback: FALLBACK,
      });

      expect(due).toMatchObject({
        dueKm: 37000,
        dueDate: new Date('2027-01-01T00:00:00Z'),
        remainingKm: 7000,
        remainingDays: 75,
        status: 'ok',
      });
    });

    it('overrides only the axis that is set', () => {
      const visits = [visit('v1', '2026-01-01T00:00:00Z', 30000, [item('engine_oil', null, 12)])];

      const [due] = computeDue({
        asOf: ASOF,
        mileageKm: 30000,
        intervals: [engineOil],
        visits,
        fallback: FALLBACK,
      });

      expect(due).toMatchObject({ dueKm: 35000, dueDate: new Date('2027-01-01T00:00:00Z') });
    });

    it('reads the reminder from the first covering line item', () => {
      const visits = [
        visit('v1', '2026-01-01T00:00:00Z', 30000, [
          item('oil_filter', 4000),
          item('engine_oil', 7000),
        ]),
      ];

      const [due] = computeDue({
        asOf: ASOF,
        mileageKm: 30000,
        intervals: [engineOil],
        visits,
        fallback: FALLBACK,
      });

      expect(due!.dueKm).toBe(34000);
    });
  });

  describe('km status (date far away)', () => {
    const asOf = new Date('2026-01-02T00:00:00Z'); // dueDate 1 Jul 2026 is 180 days out.

    it.each([
      ['overdue', 35000, 0],
      ['overdue', 35350, -350],
      ['due_soon', 34500, 500],
      ['due_soon', 34999, 1],
      ['upcoming', 33500, 1500],
      ['upcoming', 34499, 501],
      ['ok', 33499, 1501],
    ])('is %s at %i km (remaining %i)', (status, mileageKm, remainingKm) => {
      const due = single(mileageKm, asOf);

      expect(due.remainingKm).toBe(remainingKm);
      expect(due.status).toBe(status);
    });
  });

  describe('day status (km far away)', () => {
    // dueDate is 2026-07-01T00:00:00Z.
    it.each([
      ['overdue', '2026-07-01T00:00:00Z', 0],
      ['overdue', '2026-07-06T00:00:00Z', -5],
      ['overdue', '2026-06-30T23:00:00Z', 0], // Less than a day left floors to 0.
      ['due_soon', '2026-06-17T00:00:00Z', 14],
      ['due_soon', '2026-06-30T00:00:00Z', 1],
      ['upcoming', '2026-06-01T00:00:00Z', 30],
      ['upcoming', '2026-06-16T00:00:00Z', 15],
      ['ok', '2026-05-31T00:00:00Z', 31],
    ])('is %s on %s', (status, asOf, days) => {
      const due = single(30000, new Date(asOf));

      expect(due.remainingDays).toBe(Math.floor(days));
      expect(due.status).toBe(status);
    });

    it('floors partial days', () => {
      const due = single(30000, new Date('2026-06-29T01:00:00Z'));

      expect(due.remainingDays).toBe(1);
    });
  });

  it('takes the worse of the two axes', () => {
    const kmUpcomingDaysOverdue = single(33500, new Date('2026-08-01T00:00:00Z'));
    const kmOverdueDaysOk = single(36000, new Date('2026-01-02T00:00:00Z'));

    expect(kmUpcomingDaysOverdue.status).toBe('overdue');
    expect(kmOverdueDaysOk.status).toBe('overdue');
  });

  it('adds calendar months in UTC', () => {
    const visits = [visit('v1', '2026-01-31T12:00:00Z', 30000, [item('engine_oil', null, 1)])];

    const [due] = computeDue({
      asOf: ASOF,
      mileageKm: 30000,
      intervals: [engineOil],
      visits,
      fallback: FALLBACK,
    });

    expect(due!.dueDate).toEqual(new Date('2026-03-03T12:00:00Z'));
  });

  it('sorts worst status first, then by remainingKm ascending, keeping catalog order on ties', () => {
    const intervals = SERVICE_INTERVALS.map((d) => ({
      ...d,
      km: d.defaultKm,
      months: d.defaultMonths,
    }));
    const visits = [
      visit('oil', '2026-10-01T00:00:00Z', 34000, [item('engine_oil')]), // due 39000 → ok
      visit('brakes', '2025-01-01T00:00:00Z', 10000, [item('front_brake_pads')]), // due 35000 → overdue by 350
      visit('plugs', '2025-06-01T00:00:00Z', 5000, [item('spark_plugs')]), // due 35000 → overdue by 350
      visit('air', '2026-06-01T00:00:00Z', 25000, [item('cabin_filter')]), // due 35000 km → overdue by 350
    ];

    const items = computeDue({
      asOf: ASOF,
      mileageKm: 35350,
      intervals,
      visits,
      fallback: { km: 35000, date: ASOF },
    });

    expect(items.map((i) => `${i.intervalId}:${i.status}:${i.remainingKm}`)).toEqual([
      'air_filter:overdue:-350',
      'front_brake_pads:overdue:-350',
      'spark_plugs:overdue:-350',
      'engine_oil:ok:3650',
      'fuel_filter:ok:9650',
      'coolant:ok:39650',
      'gearbox_oil:ok:49650',
      'timing_belt_kit:ok:59650',
    ]);
  });

  it('returns one item per interval, carrying the catalog fields', () => {
    const items = computeDue({
      asOf: ASOF,
      mileageKm: 10000,
      intervals: [engineOil, frontBrakes],
      visits: [],
      fallback: FALLBACK,
    });

    expect(items).toHaveLength(2);
    expect(items.map((i) => i.intervalId).sort()).toEqual(['engine_oil', 'front_brake_pads']);
    expect(items.find((i) => i.intervalId === 'engine_oil')).toMatchObject({
      title: engineOil.title,
      description: engineOil.description,
      icon: 'oil_barrel',
      coversItemIds: ['engine_oil', 'oil_filter'],
    });
  });
});
