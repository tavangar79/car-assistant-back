import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { InMemoryNotificationRepository } from '../../test/in-memory-notification.repository.ts';
import { createTestDependencies, TEST_JWT_SECRET } from '../../test/test-dependencies.ts';
import { TokenService } from '../auth/token.service.ts';

const tokens = new TokenService(TEST_JWT_SECRET, '30d');
const ALICE = `Bearer ${tokens.sign('aaaaaaaaaaaaaaaaaaaaaaaa')}`;
const BOB = `Bearer ${tokens.sign('bbbbbbbbbbbbbbbbbbbbbbbb')}`;
const NOW = new Date('2026-10-17T10:00:00.000Z');
const IN_5_DAYS = '2026-10-22T10:00:00.000Z';
const IN_20_DAYS = '2026-11-06T10:00:00.000Z';

const vehicleBody = (threeDigits = '345') => ({
  nickname: 'تارا',
  plate: { twoDigits: '72', letter: 'ب', threeDigits, provinceCode: '68' },
  makeId: 'iran-khodro',
  modelId: 'tara',
  yearJalali: 1402,
  mileageKm: 34500,
});

describe('/api/notifications', () => {
  let app: ReturnType<typeof createApp>;
  let notifications: InMemoryNotificationRepository;
  let vehicleId: string;

  beforeEach(async () => {
    notifications = new InMemoryNotificationRepository();
    app = createApp(
      createTestDependencies({ now: () => NOW, notificationRepository: notifications }),
    );
    vehicleId = await addVehicle(ALICE);
  });

  async function addVehicle(auth: string, threeDigits = '345'): Promise<string> {
    const res = await request(app)
      .post('/api/vehicles')
      .set('Authorization', auth)
      .send(vehicleBody(threeDigits))
      .expect(201);
    return res.body.id;
  }

  async function addDocument(expiresAt: string, auth = ALICE, vehicle = vehicleId) {
    const res = await request(app)
      .post(`/api/vehicles/${vehicle}/documents`)
      .set('Authorization', auth)
      .send({ type: 'body_insurance', expiresAt })
      .expect(201);
    return res.body.document.id as string;
  }

  async function addExpense(expiresAt: string) {
    const res = await request(app)
      .post(`/api/vehicles/${vehicleId}/expenses`)
      .set('Authorization', ALICE)
      .send({
        category: 'third_party_insurance',
        amount: 1,
        paidAt: '2025-10-22T00:00:00Z',
        expiresAt,
      })
      .expect(201);
    return res.body.expense.id as string;
  }

  const list = (auth = ALICE) => request(app).get('/api/notifications').set('Authorization', auth);
  const expiryNotifications = async (auth = ALICE) =>
    ((await list(auth).expect(200)).body.notifications as { kind: string; refId: string }[]).filter(
      (n) => !n.kind.startsWith('interval_'),
    );

  it.each([
    ['get', '/api/notifications'],
    ['get', '/api/notifications/unread-count'],
    ['patch', `/api/notifications/${'0'.repeat(24)}/read`],
    ['post', '/api/notifications/read-all'],
  ] as const)('%s %s returns 401 without a token', async (method, path) => {
    await request(app)[method](path).expect(401);
  });

  describe('GET /', () => {
    it('syncs, then returns the notification JSON with the unread count', async () => {
      const documentId = await addDocument(IN_5_DAYS);

      const res = await list().expect(200);

      const document = res.body.notifications.find(
        (n: { refId: string }) => n.refId === documentId,
      );
      expect(document).toEqual({
        id: expect.stringMatching(/^[a-f\d]{24}$/),
        kind: 'document_expiry',
        category: 'documents',
        vehicleId,
        refId: documentId,
        subject: 'بیمه بدنه',
        dueKm: null,
        remainingKm: null,
        mileageKm: null,
        expiresAt: IN_5_DAYS,
        thresholdDays: 7,
        read: false,
        createdAt: NOW.toISOString(),
      });
      expect(res.body.unreadCount).toBe(res.body.notifications.length);
    });

    it('includes interval notifications in the service category', async () => {
      const res = await list().expect(200);

      // Created 2026-01-01, the vehicle's 6-month intervals are overdue on 2026-10-17.
      expect(res.body.notifications).toContainEqual(
        expect.objectContaining({
          kind: 'interval_overdue',
          category: 'service',
          refId: 'engine_oil',
          mileageKm: 34500,
        }),
      );
    });

    it('does not duplicate on repeated reads', async () => {
      await addDocument(IN_5_DAYS);
      const first = await list().expect(200);

      const second = await list().expect(200);

      expect(second.body.notifications).toEqual(first.body.notifications);
    });

    it("never shows another user's notifications", async () => {
      await addDocument(IN_5_DAYS);

      const res = await list(BOB).expect(200);

      expect(res.body).toEqual({ notifications: [], unreadCount: 0 });
    });
  });

  describe('GET /unread-count', () => {
    it('syncs, then returns the unread count', async () => {
      await addDocument(IN_5_DAYS);
      const all = (await list().expect(200)).body.notifications.length;

      const res = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', ALICE)
        .expect(200);

      expect(res.body).toEqual({ unreadCount: all });
    });
  });

  describe('PATCH /:id/read', () => {
    it('returns 200 with the notification marked read, idempotently', async () => {
      const [first] = (await list().expect(200)).body.notifications;
      const before = (await list().expect(200)).body.unreadCount;

      const res = await request(app)
        .patch(`/api/notifications/${first.id}/read`)
        .set('Authorization', ALICE)
        .expect(200);
      await request(app)
        .patch(`/api/notifications/${first.id}/read`)
        .set('Authorization', ALICE)
        .expect(200);

      expect(res.body.notification).toEqual({ ...first, read: true });
      expect((await list().expect(200)).body.unreadCount).toBe(before - 1);
    });

    it.each(['nope', '0'.repeat(24)])('returns 404 for id %s', async (id) => {
      const res = await request(app)
        .patch(`/api/notifications/${id}/read`)
        .set('Authorization', ALICE)
        .expect(404);

      expect(res.body).toEqual({ error: { message: 'Notification not found' } });
    });

    it("returns 404 for another user's notification", async () => {
      const [first] = (await list().expect(200)).body.notifications;

      await request(app)
        .patch(`/api/notifications/${first.id}/read`)
        .set('Authorization', BOB)
        .expect(404);
    });
  });

  describe('POST /read-all', () => {
    it("marks the caller's unread ones read and returns how many", async () => {
      await addDocument(IN_5_DAYS);
      const bobsVehicle = await addVehicle(BOB, '999');
      await addDocument(IN_5_DAYS, BOB, bobsVehicle);
      const unread = (await list().expect(200)).body.unreadCount;
      const bobsUnread = (await list(BOB).expect(200)).body.unreadCount;

      const res = await request(app)
        .post('/api/notifications/read-all')
        .set('Authorization', ALICE)
        .expect(200);

      expect(res.body).toEqual({ updatedCount: unread });
      expect((await list().expect(200)).body.unreadCount).toBe(0);
      expect((await list(BOB).expect(200)).body.unreadCount).toBe(bobsUnread);
    });
  });

  describe('cascade', () => {
    it('deleting an expense deletes its notifications', async () => {
      const expenseId = await addExpense(IN_20_DAYS);
      expect((await expiryNotifications()).map((n) => n.refId)).toEqual([expenseId]);

      await request(app)
        .delete(`/api/vehicles/${vehicleId}/expenses/${expenseId}`)
        .set('Authorization', ALICE)
        .expect(204);

      expect([...notifications.notifications.values()].some((n) => n.refId === expenseId)).toBe(
        false,
      );
    });

    it('deleting a document deletes its notifications', async () => {
      const documentId = await addDocument(IN_5_DAYS);
      expect((await expiryNotifications()).map((n) => n.refId)).toEqual([documentId]);

      await request(app)
        .delete(`/api/vehicles/${vehicleId}/documents/${documentId}`)
        .set('Authorization', ALICE)
        .expect(204);

      expect([...notifications.notifications.values()].some((n) => n.refId === documentId)).toBe(
        false,
      );
    });

    it('deleting a vehicle deletes all of its notifications', async () => {
      await addDocument(IN_5_DAYS);
      await list().expect(200);
      expect(notifications.notifications.size).toBeGreaterThan(0);

      await request(app)
        .delete(`/api/vehicles/${vehicleId}`)
        .set('Authorization', ALICE)
        .expect(204);

      expect(notifications.notifications.size).toBe(0);
    });
  });
});
