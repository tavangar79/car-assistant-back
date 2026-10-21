import { describe, expect, it } from 'vitest';
import { computeEconomy, type EconomyLog } from './compute-economy.ts';

let createdAtMs = Date.UTC(2026, 0, 1);

function log(
  id: string,
  fueledAt: string,
  odometerKm: number,
  volume: number,
  overrides: Partial<EconomyLog> = {},
): EconomyLog {
  return {
    id,
    fueledAt: new Date(fueledAt),
    odometerKm,
    volume,
    isFullFill: true,
    fuelType: 'super',
    createdAt: new Date(createdAtMs++),
    ...overrides,
  };
}

describe('computeEconomy', () => {
  it('is null for the first log', () => {
    expect(computeEconomy([log('a', '2026-01-01', 1000, 40)])).toEqual(new Map([['a', null]]));
  });

  it('is null for a partial fill', () => {
    const logs = [
      log('a', '2026-01-01', 1000, 40),
      log('b', '2026-01-10', 1500, 20, { isFullFill: false }),
    ];

    expect(computeEconomy(logs).get('b')).toBeNull();
  });

  it('is set for two consecutive full fills', () => {
    const logs = [log('a', '2026-01-01', 1000, 40), log('b', '2026-01-10', 1500, 37.3)];

    expect(computeEconomy(logs)).toEqual(
      new Map([
        ['a', null],
        ['b', 7.46],
      ]),
    );
  });

  it('sums the partial fills between two full fills', () => {
    const logs = [
      log('a', '2026-01-01', 1000, 40),
      log('b', '2026-01-05', 1200, 10, { isFullFill: false }),
      log('c', '2026-01-08', 1400, 15, { isFullFill: false }),
      log('d', '2026-01-10', 1500, 20),
    ];

    expect(computeEconomy(logs).get('d')).toBe(9);
    expect(computeEconomy(logs).get('b')).toBeNull();
    expect(computeEconomy(logs).get('c')).toBeNull();
  });

  it('is null when a log in the window has another fuel type', () => {
    const logs = [
      log('a', '2026-01-01', 1000, 40),
      log('b', '2026-01-05', 1200, 10, { isFullFill: false, fuelType: 'regular' }),
      log('c', '2026-01-10', 1500, 20),
    ];

    expect(computeEconomy(logs).get('c')).toBeNull();
  });

  it('is null when the full fill itself has another fuel type than the previous one', () => {
    const logs = [
      log('a', '2026-01-01', 1000, 40),
      log('b', '2026-01-10', 1500, 20, { fuelType: 'regular' }),
      log('c', '2026-01-20', 2000, 20, { fuelType: 'regular' }),
    ];

    expect(computeEconomy(logs).get('b')).toBeNull();
    expect(computeEconomy(logs).get('c')).toBe(4);
  });

  it.each([
    ['zero', 1000],
    ['negative', 900],
  ])('is null for a %s km delta', (_name, odometerKm) => {
    const logs = [log('a', '2026-01-01', 1000, 40), log('b', '2026-01-10', odometerKm, 20)];

    expect(computeEconomy(logs).get('b')).toBeNull();
  });

  it('does not depend on the list order', () => {
    const logs = [
      log('d', '2026-01-10', 1500, 20),
      log('b', '2026-01-05', 1200, 10, { isFullFill: false }),
      log('a', '2026-01-01', 1000, 40),
      log('c', '2026-01-08', 1400, 15, { isFullFill: false }),
    ];

    expect(computeEconomy(logs)).toEqual(computeEconomy([...logs].reverse()));
    expect(computeEconomy(logs).get('d')).toBe(9);
  });

  it('orders same-day logs by odometer, then by creation', () => {
    const sameDay = '2026-01-10T00:00:00Z';
    const logs = [
      log('later', sameDay, 1500, 20),
      log('earlier', sameDay, 1000, 40),
      log('tieB', sameDay, 2000, 30, { createdAt: new Date(2) }),
      log('tieA', sameDay, 2000, 30, { createdAt: new Date(1) }),
    ];

    const economy = computeEconomy(logs);

    expect(economy.get('earlier')).toBeNull();
    expect(economy.get('later')).toBe(4);
    expect(economy.get('tieA')).toBe(6);
    expect(economy.get('tieB')).toBeNull();
  });

  it('rounds to 2 decimals', () => {
    const logs = [log('a', '2026-01-01', 0, 1), log('b', '2026-01-10', 300, 20)];

    expect(computeEconomy(logs).get('b')).toBe(6.67);
  });
});
