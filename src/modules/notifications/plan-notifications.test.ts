import { describe, expect, it } from 'vitest';
import type { DueItem, DueStatus } from '../service-intervals/compute-due.ts';
import { expiryThreshold, planNotifications, type PlanInput } from './plan-notifications.ts';

const NOW = new Date('2026-10-17T10:00:00.000Z');
const DAY_MS = 86_400_000;
const CAR = 'cccccccccccccccccccccccc';
const EXPENSE = 'eeeeeeeeeeeeeeeeeeeeeeee';
const DOCUMENT = 'dddddddddddddddddddddddd';

const inDays = (days: number) => new Date(NOW.getTime() + days * DAY_MS);

function dueItem(status: DueStatus, overrides: Partial<DueItem> = {}): DueItem {
  return {
    intervalId: 'engine_oil',
    title: 'روغن موتور و فیلتر روغن',
    description: '',
    icon: 'oil_barrel',
    coversItemIds: ['engine_oil', 'oil_filter'],
    status,
    baselineKm: 37000,
    baselineDate: new Date('2026-06-01T08:00:00.000Z'),
    baselineServiceId: null,
    dueKm: 42000,
    dueDate: new Date('2026-12-01T08:00:00.000Z'),
    remainingKm: 150,
    remainingDays: 44,
    ...overrides,
  };
}

const expense = (overrides: Partial<PlanInput['expenses'][number]> = {}) => ({
  id: EXPENSE,
  vehicleId: CAR,
  category: 'third_party_insurance',
  title: null,
  expiresAt: inDays(10),
  expiryReminder: true,
  ...overrides,
});

const document = (overrides: Partial<PlanInput['documents'][number]> = {}) => ({
  id: DOCUMENT,
  vehicleId: CAR,
  type: 'inspection',
  title: null,
  expiresAt: inDays(10),
  expiryReminder: true,
  ...overrides,
});

const plan = (input: Partial<PlanInput>) =>
  planNotifications({ now: NOW, vehicles: [], expenses: [], documents: [], ...input });

describe('expiryThreshold', () => {
  it.each([
    [30, 30],
    [29.5, 30],
    [16, 30],
    [15, 15],
    [8, 15],
    [7, 7],
    [1, 7],
    [0.001, 7],
  ])('%s days left → %s', (days, threshold) => {
    expect(expiryThreshold(inDays(days), NOW)).toBe(threshold);
  });

  it.each([30.001, 31, 365])('is null %s days away', (days) => {
    expect(expiryThreshold(inDays(days), NOW)).toBeNull();
  });

  it.each([0, -0.5, -10])('is null when expired (%s days)', (days) => {
    expect(expiryThreshold(inDays(days), NOW)).toBeNull();
  });
});

describe('planNotifications', () => {
  describe('expiry', () => {
    it('plans an expense reminder with its key and snapshot', () => {
      const expiresAt = inDays(10);

      expect(plan({ expenses: [expense({ expiresAt })] })).toEqual([
        {
          key: `expense:${EXPENSE}:${expiresAt.toISOString()}:15`,
          kind: 'expense_expiry',
          vehicleId: CAR,
          refId: EXPENSE,
          subject: 'بیمه شخص ثالث',
          dueKm: null,
          remainingKm: null,
          mileageKm: null,
          expiresAt,
          thresholdDays: 15,
        },
      ]);
    });

    it('plans a document reminder with the type title as subject', () => {
      const expiresAt = inDays(3);

      expect(plan({ documents: [document({ expiresAt })] })).toEqual([
        expect.objectContaining({
          key: `document:${DOCUMENT}:${expiresAt.toISOString()}:7`,
          kind: 'document_expiry',
          refId: DOCUMENT,
          subject: 'معاینه فنی',
          thresholdDays: 7,
        }),
      ]);
    });

    it('uses the title as subject when there is one', () => {
      const subjects = plan({
        expenses: [expense({ title: 'بیمه ایران' })],
        documents: [document({ title: 'گواهی معاینه فنی برتر' })],
      }).map((n) => n.subject);

      expect(subjects).toEqual(['بیمه ایران', 'گواهی معاینه فنی برتر']);
    });

    it.each([
      [30, 30],
      [20, 30],
      [15, 15],
      [10, 15],
      [7, 7],
      [1, 7],
    ])('%s days left gives threshold %s', (days, threshold) => {
      const thresholds = plan({ expenses: [expense({ expiresAt: inDays(days) })] }).map(
        (n) => n.thresholdDays,
      );

      expect(thresholds).toEqual([threshold]);
    });

    it('creates only the current threshold, never the skipped earlier ones', () => {
      const expiresAt = inDays(5);

      expect(plan({ expenses: [expense({ expiresAt })] }).map((n) => n.key)).toEqual([
        `expense:${EXPENSE}:${expiresAt.toISOString()}:7`,
      ]);
    });

    it('creates nothing more than 30 days ahead', () => {
      expect(plan({ expenses: [expense({ expiresAt: inDays(31) })] })).toEqual([]);
    });

    it('creates nothing for an expired item', () => {
      expect(
        plan({
          expenses: [expense({ expiresAt: inDays(0) })],
          documents: [document({ expiresAt: inDays(-3) })],
        }),
      ).toEqual([]);
    });

    it('creates nothing when the reminder is off', () => {
      expect(
        plan({
          expenses: [expense({ expiryReminder: false })],
          documents: [document({ expiryReminder: false })],
        }),
      ).toEqual([]);
    });

    it('creates nothing without an expiry', () => {
      expect(
        plan({
          expenses: [expense({ expiresAt: null })],
          documents: [document({ expiresAt: null })],
        }),
      ).toEqual([]);
    });

    it('gives a renewed expiry a new key', () => {
      const [before] = plan({ documents: [document({ expiresAt: inDays(10) })] });
      const [after] = plan({ documents: [document({ expiresAt: inDays(12) })] });

      expect(after!.key).not.toBe(before!.key);
    });
  });

  describe('intervals', () => {
    const vehicle = (items: DueItem[]) => ({ vehicleId: CAR, mileageKm: 41850, items });

    it('plans a due_soon interval with its key and snapshot', () => {
      const item = dueItem('due_soon');

      expect(plan({ vehicles: [vehicle([item])] })).toEqual([
        {
          key: `interval:${CAR}:engine_oil:2026-06-01T08:00:00.000Z:due_soon`,
          kind: 'interval_due_soon',
          vehicleId: CAR,
          refId: 'engine_oil',
          subject: 'روغن موتور و فیلتر روغن',
          dueKm: 42000,
          remainingKm: 150,
          mileageKm: 41850,
          expiresAt: item.dueDate,
          thresholdDays: null,
        },
      ]);
    });

    it('plans an overdue interval as interval_overdue', () => {
      const [notification] = plan({
        vehicles: [vehicle([dueItem('overdue', { remainingKm: -200 })])],
      });

      expect(notification).toMatchObject({
        key: `interval:${CAR}:engine_oil:2026-06-01T08:00:00.000Z:overdue`,
        kind: 'interval_overdue',
        remainingKm: -200,
      });
    });

    it('notifies again when due_soon turns overdue', () => {
      const [dueSoon] = plan({ vehicles: [vehicle([dueItem('due_soon')])] });
      const [overdue] = plan({ vehicles: [vehicle([dueItem('overdue')])] });

      expect(overdue!.key).not.toBe(dueSoon!.key);
    });

    it('notifies again after a new covering service moves the baseline', () => {
      const [before] = plan({ vehicles: [vehicle([dueItem('due_soon')])] });
      const [after] = plan({
        vehicles: [
          vehicle([dueItem('due_soon', { baselineDate: new Date('2026-12-01T08:00:00.000Z') })]),
        ],
      });

      expect(after!.key).not.toBe(before!.key);
    });

    it.each(['upcoming', 'ok'] as const)('ignores %s intervals', (status) => {
      expect(plan({ vehicles: [vehicle([dueItem(status)])] })).toEqual([]);
    });
  });
});
