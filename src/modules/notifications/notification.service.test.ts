import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError } from '../../shared/errors.ts';
import { createGarage, type Garage } from '../../test/garage-fixture.ts';
import { SERVICE_INTERVALS } from '../service-intervals/service-interval.data.ts';
import { ServiceIntervalService } from '../service-intervals/service-interval.service.ts';
import type { NewNotification } from './notification.types.ts';
import { NotificationService } from './notification.service.ts';

const ALICE = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BOB = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const DAY_MS = 86_400_000;
// The first odometer reading (34,500 km on 2026-01-01) is every interval's baseline until a
// covering service. On START every interval is still `ok`.
const START = new Date('2026-02-01T10:00:00.000Z');
const VEHICLE_CREATED = '2026-01-01T00:00:00.000Z';

const inDays = (from: Date, days: number) => new Date(from.getTime() + days * DAY_MS);

describe('NotificationService', () => {
  let garage: Garage;
  let now: Date;
  let service: NotificationService;
  let vehicleId: string;

  beforeEach(async () => {
    garage = createGarage(START);
    now = START;
    const r = garage.repositories;
    service = new NotificationService({
      notifications: r.notificationRepository,
      vehicles: garage.vehicleService,
      intervals: new ServiceIntervalService({
        definitions: SERVICE_INTERVALS,
        overrides: r.serviceIntervalRepository,
        vehicles: garage.vehicleService,
        visits: r.serviceVisitRepository,
        readings: r.odometerReadingRepository,
        now: () => now,
      }),
      expenses: r.expenseRepository,
      documents: r.documentRepository,
      now: () => now,
    });
    vehicleId = await garage.addVehicle(ALICE);
    await setMileage(34500, new Date(VEHICLE_CREATED));
  });

  const stored = () => [...garage.repositories.notificationRepository.notifications.values()];
  const keys = () => stored().map((n) => n.key);
  /** Records an odometer reading, which also sets the vehicle's mileage. */
  const setMileage = (mileageKm: number, recordedAt = now) =>
    garage.repositories.odometerReadingRepository.record({ vehicleId, mileageKm, recordedAt });
  const sync = () => service.sync(ALICE, now);

  describe('sync', () => {
    it('creates nothing while every interval is ok and nothing expires', async () => {
      await garage.addDocument(vehicleId, { expiresAt: inDays(START, 60) });

      await sync();

      expect(stored()).toEqual([]);
    });

    it('creates a due_soon interval notification with its snapshot', async () => {
      await setMileage(39100);

      await sync();

      expect(stored()).toEqual([
        {
          id: expect.stringMatching(/^[a-f\d]{24}$/),
          userId: ALICE,
          key: `interval:${vehicleId}:engine_oil:${VEHICLE_CREATED}:due_soon`,
          kind: 'interval_due_soon',
          vehicleId,
          refId: 'engine_oil',
          subject: 'روغن موتور و فیلتر روغن',
          dueKm: 39500,
          remainingKm: 400,
          mileageKm: 39100,
          expiresAt: new Date('2026-07-01T00:00:00.000Z'),
          thresholdDays: null,
          readAt: null,
          createdAt: START,
        },
      ]);
    });

    it('notifies again when due_soon turns overdue', async () => {
      await setMileage(39100);
      await sync();
      await setMileage(39600);

      await sync();

      expect(keys()).toEqual([
        `interval:${vehicleId}:engine_oil:${VEHICLE_CREATED}:due_soon`,
        `interval:${vehicleId}:engine_oil:${VEHICLE_CREATED}:overdue`,
      ]);
    });

    it('notifies again in the next cycle after a covering service', async () => {
      await setMileage(39600);
      await sync();
      now = inDays(START, 10);
      const serviceDate = now.toISOString();
      await garage.addService(vehicleId, serviceDate, { engine_oil: 1 }, { odometerKm: 39600 });
      await sync();
      expect(stored()).toHaveLength(1);

      await setMileage(44200);
      await sync();

      // 44,200 km also brings the 10,000 km intervals (air and fuel filter) into due_soon.
      expect(keys().filter((key) => key.includes(':engine_oil:'))).toEqual([
        `interval:${vehicleId}:engine_oil:${VEHICLE_CREATED}:overdue`,
        `interval:${vehicleId}:engine_oil:${serviceDate}:due_soon`,
      ]);
    });

    it('creates the current expiry threshold for expenses and documents', async () => {
      const expenseExpiry = inDays(START, 10);
      const documentExpiry = inDays(START, 3);
      const expenseId = await garage.addExpense(vehicleId, '2025-02-01T00:00:00Z', {
        category: 'body_insurance',
        expiresAt: expenseExpiry,
      });
      const documentId = await garage.addDocument(vehicleId, {
        type: 'inspection',
        title: 'گواهی معاینه فنی برتر',
        expiresAt: documentExpiry,
      });

      await sync();

      expect(stored()).toEqual([
        expect.objectContaining({
          key: `expense:${expenseId}:${expenseExpiry.toISOString()}:15`,
          kind: 'expense_expiry',
          refId: expenseId,
          subject: 'بیمه بدنه',
          expiresAt: expenseExpiry,
          thresholdDays: 15,
        }),
        expect.objectContaining({
          key: `document:${documentId}:${documentExpiry.toISOString()}:7`,
          kind: 'document_expiry',
          refId: documentId,
          subject: 'گواهی معاینه فنی برتر',
          thresholdDays: 7,
        }),
      ]);
    });

    it('adds the next threshold as the expiry gets closer, without the skipped ones', async () => {
      const expiresAt = inDays(START, 25);
      await garage.addDocument(vehicleId, { expiresAt });
      await sync();

      now = inDays(START, 20);
      await sync();

      expect(stored().map((n) => n.thresholdDays)).toEqual([30, 7]);
    });

    it('ignores expired items and items with the reminder off', async () => {
      await garage.addExpense(vehicleId, '2025-02-01T00:00:00Z', { expiresAt: inDays(START, -1) });
      await garage.addDocument(vehicleId, { expiresAt: inDays(START, 5), expiryReminder: false });

      await sync();

      expect(stored()).toEqual([]);
    });

    it('is idempotent: a second sync creates no duplicates', async () => {
      await setMileage(39100);
      await garage.addDocument(vehicleId, { expiresAt: inDays(START, 5) });
      await sync();

      await sync();

      expect(stored()).toHaveLength(2);
    });

    it('deletes notifications older than 90 days', async () => {
      const seeded = (key: string, createdAt: Date): NewNotification => ({
        userId: ALICE,
        key,
        kind: 'document_expiry',
        vehicleId,
        refId: 'x',
        subject: 'x',
        dueKm: null,
        remainingKm: null,
        mileageKm: null,
        expiresAt: null,
        thresholdDays: 7,
        createdAt,
      });
      await garage.repositories.notificationRepository.createMany([
        seeded('old', inDays(START, -90.01)),
        seeded('recent', inDays(START, -89)),
        { ...seeded('bobs-old', inDays(START, -200)), userId: BOB },
      ]);

      await sync();

      expect(keys()).toEqual(['recent', 'bobs-old']);
    });

    it("only covers the user's own vehicles", async () => {
      const bobs = await garage.addVehicle(BOB, '999');
      await garage.addDocument(bobs, { expiresAt: inDays(START, 5) });

      await sync();

      expect(stored()).toEqual([]);
    });
  });

  describe('list', () => {
    it('syncs, then returns newest first with the unread count', async () => {
      await garage.addDocument(vehicleId, { expiresAt: inDays(START, 25) });
      await sync();
      now = inDays(START, 12);

      const { notifications, unreadCount } = await service.list(ALICE);

      expect(notifications.map((n) => n.thresholdDays)).toEqual([15, 30]);
      expect(notifications[0]).toMatchObject({
        category: 'documents',
        read: false,
        createdAt: now,
      });
      expect(unreadCount).toBe(2);
    });

    it('returns at most 100', async () => {
      for (let i = 0; i < 101; i++) {
        await garage.addDocument(vehicleId, { expiresAt: inDays(START, 5) });
      }

      const { notifications, unreadCount } = await service.list(ALICE);

      expect(notifications).toHaveLength(100);
      expect(unreadCount).toBe(101);
    });

    it('derives the service category for interval kinds', async () => {
      await setMileage(39600);

      const { notifications } = await service.list(ALICE);

      expect(notifications).toEqual([
        {
          id: expect.any(String),
          kind: 'interval_overdue',
          category: 'service',
          vehicleId,
          refId: 'engine_oil',
          subject: 'روغن موتور و فیلتر روغن',
          dueKm: 39500,
          remainingKm: -100,
          mileageKm: 39600,
          expiresAt: new Date('2026-07-01T00:00:00.000Z'),
          thresholdDays: null,
          read: false,
          createdAt: START,
        },
      ]);
    });
  });

  describe('unreadCount', () => {
    it('syncs, then counts the unread ones', async () => {
      await setMileage(39100);

      expect(await service.unreadCount(ALICE)).toBe(1);
      expect(await service.unreadCount(BOB)).toBe(0);
    });
  });

  describe('markRead', () => {
    let id: string;

    beforeEach(async () => {
      await setMileage(39100);
      id = (await service.list(ALICE)).notifications[0]!.id;
    });

    it('marks it read and is idempotent', async () => {
      now = inDays(START, 1);
      const first = await service.markRead(ALICE, id);
      now = inDays(START, 2);
      const second = await service.markRead(ALICE, id);

      expect(first.read).toBe(true);
      expect(second.read).toBe(true);
      expect(stored()[0]!.readAt).toEqual(inDays(START, 1));
      expect(await service.unreadCount(ALICE)).toBe(0);
    });

    it.each([
      ['a malformed id', () => 'nope'],
      ['an unknown id', () => '0'.repeat(24)],
    ])('returns 404 for %s', async (_name, idOf) => {
      await expect(service.markRead(ALICE, idOf())).rejects.toBeInstanceOf(NotFoundError);
    });

    it("returns 404 for another user's notification", async () => {
      await expect(service.markRead(BOB, id)).rejects.toBeInstanceOf(NotFoundError);
      expect(stored()[0]!.readAt).toBeNull();
    });
  });

  describe('markAllRead', () => {
    it("marks only the caller's unread ones and returns how many", async () => {
      await setMileage(39100);
      await garage.addDocument(vehicleId, { expiresAt: inDays(START, 5) });
      const bobs = await garage.addVehicle(BOB, '999');
      await garage.addDocument(bobs, { expiresAt: inDays(START, 5) });
      await service.list(ALICE);
      await service.list(BOB);

      expect(await service.markAllRead(ALICE)).toBe(2);
      expect(await service.markAllRead(ALICE)).toBe(0);
      expect(await service.unreadCount(BOB)).toBe(1);
    });
  });
});
