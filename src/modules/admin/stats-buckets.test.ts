import { describe, expect, it } from 'vitest';
import {
  addDays,
  bucketStart,
  bucketStarts,
  buildSeries,
  daysInRange,
  tehranDate,
} from './stats-buckets.ts';

describe('tehranDate', () => {
  it('uses the Tehran calendar day (UTC+3:30)', () => {
    expect(tehranDate(new Date('2026-11-05T20:29:59Z'))).toBe('2026-11-05');
    expect(tehranDate(new Date('2026-11-05T20:30:00Z'))).toBe('2026-11-06');
  });
});

describe('addDays / daysInRange', () => {
  it('crosses month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts both ends', () => {
    expect(daysInRange('2026-10-08', '2026-11-06')).toBe(30);
    expect(daysInRange('2026-01-01', '2026-01-01')).toBe(1);
  });
});

describe('bucketStart', () => {
  it('is the day itself for day buckets', () => {
    expect(bucketStart('2026-11-04', 'day')).toBe('2026-11-04');
  });

  it('is the Saturday on or before the day for week buckets', () => {
    // 2026-10-31 is a Saturday.
    expect(bucketStart('2026-10-31', 'week')).toBe('2026-10-31');
    expect(bucketStart('2026-11-06', 'week')).toBe('2026-10-31'); // Friday
    expect(bucketStart('2026-11-07', 'week')).toBe('2026-11-07'); // next Saturday
  });

  it('is the 1st for month buckets', () => {
    expect(bucketStart('2026-11-06', 'month')).toBe('2026-11-01');
  });
});

describe('bucketStarts', () => {
  it('lists every day in the range', () => {
    expect(bucketStarts('2026-12-30', '2027-01-02', 'day')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });

  it('lists weeks overlapping the range, the first starting before it', () => {
    expect(bucketStarts('2026-11-02', '2026-11-14', 'week')).toEqual([
      '2026-10-31',
      '2026-11-07',
      '2026-11-14',
    ]);
  });

  it('lists months across a year end', () => {
    expect(bucketStarts('2026-11-15', '2027-02-01', 'month')).toEqual([
      '2026-11-01',
      '2026-12-01',
      '2027-01-01',
      '2027-02-01',
    ]);
  });
});

describe('buildSeries', () => {
  it('is dense, with zero buckets included', () => {
    const series = buildSeries('2026-11-01', '2026-11-03', 'day', { users: [], vehicles: [] });

    expect(series).toEqual([
      { bucketStart: '2026-11-01', users: 0, vehicles: 0 },
      { bucketStart: '2026-11-02', users: 0, vehicles: 0 },
      { bucketStart: '2026-11-03', users: 0, vehicles: 0 },
    ]);
  });

  it('counts each instant in the bucket of its Tehran day', () => {
    const series = buildSeries('2026-11-01', '2026-11-02', 'day', {
      users: [
        new Date('2026-10-31T21:00:00Z'), // 2026-11-01 00:30 in Tehran
        new Date('2026-11-01T20:29:00Z'), // 2026-11-01 23:59 in Tehran
        new Date('2026-11-01T20:31:00Z'), // 2026-11-02 00:01 in Tehran
      ],
    });

    expect(series).toEqual([
      { bucketStart: '2026-11-01', users: 2 },
      { bucketStart: '2026-11-02', users: 1 },
    ]);
  });

  it('ignores instants outside the range', () => {
    const series = buildSeries('2026-11-01', '2026-11-01', 'day', {
      users: [new Date('2026-10-31T20:00:00Z'), new Date('2026-11-01T21:00:00Z')],
    });

    expect(series).toEqual([{ bucketStart: '2026-11-01', users: 0 }]);
  });

  it('groups by Saturday weeks and by months', () => {
    const instants = {
      fuelLogs: [new Date('2026-11-02T08:00:00Z'), new Date('2026-11-08T08:00:00Z')],
    };

    expect(buildSeries('2026-11-01', '2026-11-10', 'week', instants)).toEqual([
      { bucketStart: '2026-10-31', fuelLogs: 1 },
      { bucketStart: '2026-11-07', fuelLogs: 1 },
    ]);
    expect(buildSeries('2026-11-01', '2026-11-10', 'month', instants)).toEqual([
      { bucketStart: '2026-11-01', fuelLogs: 2 },
    ]);
  });
});
