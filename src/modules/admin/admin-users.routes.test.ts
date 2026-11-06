import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { adminFixture } from '../../test/admin-fixture.ts';
import { FakeSmsSender } from '../../test/fake-sms-sender.ts';
import { InMemoryCollectionRepository } from '../../test/in-memory-collection.repository.ts';
import { InMemoryUserRepository } from '../../test/in-memory-user.repository.ts';
import { createTestDependencies, TEST_JWT_SECRET } from '../../test/test-dependencies.ts';
import { TokenService } from '../auth/token.service.ts';

const ALICE = 'a00000000000000000000001';
const BOB = 'a00000000000000000000002';
const CAROL = 'a00000000000000000000003';
const VEHICLE = 'b00000000000000000000001';
const MISSING = 'ffffffffffffffffffffffff';
const CREATED = new Date('2026-01-02T03:04:05.000Z');
const NOW = new Date('2026-11-06T10:00:00Z');
const BLOCKED_BODY = {
  error: {
    message: 'حساب کاربری شما مسدود شده است. با پشتیبانی تماس بگیرید.',
    details: { code: 'user_blocked' },
  },
};

const plate = { twoDigits: '72', letter: 'ب', threeDigits: '345', provinceCode: '68' };

describe('/api/admin/users', () => {
  let app: ReturnType<typeof createApp>;
  let users: InMemoryUserRepository;
  let sms: FakeSmsSender;
  let logs: string[];
  let ADMIN: string;

  beforeEach(() => {
    users = new InMemoryUserRepository([
      {
        id: ALICE,
        phone: '09120000001',
        firstName: 'Ali',
        lastName: 'Rezaei',
        birthDate: new Date('1990-05-06T00:00:00Z'),
        createdAt: CREATED,
      },
      { id: BOB, phone: '09350000002', firstName: 'Bita', lastName: 'Karimi', createdAt: CREATED },
      { id: CAROL, phone: '09120000003', createdAt: CREATED },
    ]);
    const collections = new InMemoryCollectionRepository({
      vehicles: [
        {
          id: VEHICLE,
          userId: ALICE,
          nickname: 'Pride',
          plate,
          makeId: 'saipa',
          modelId: 'pride',
          yearJalali: 1395,
          mileageKm: 1000,
          isDefault: true,
          createdAt: CREATED,
          updatedAt: CREATED,
        },
        {
          id: 'b00000000000000000000002',
          userId: BOB,
          nickname: 'Tara',
          plate,
          createdAt: CREATED,
        },
      ],
      fuel_logs: [
        { id: 'c00000000000000000000001', vehicleId: VEHICLE, createdAt: CREATED },
        { id: 'c00000000000000000000002', vehicleId: VEHICLE, createdAt: CREATED },
      ],
      vehicle_documents: [
        { id: 'd00000000000000000000001', vehicleId: VEHICLE, createdAt: CREATED },
      ],
      vehicle_transfers: [
        {
          id: 'e00000000000000000000001',
          vehicleId: VEHICLE,
          fromUserId: ALICE,
          toPhone: '09350000002',
          status: 'pending',
          createdAt: CREATED,
        },
        {
          id: 'e00000000000000000000002',
          vehicleId: VEHICLE,
          fromUserId: BOB,
          toPhone: '09120000001',
          status: 'rejected',
          createdAt: CREATED,
          respondedAt: CREATED,
        },
        {
          id: 'e00000000000000000000003',
          vehicleId: VEHICLE,
          fromUserId: BOB,
          toPhone: '09120000003',
          status: 'pending',
          createdAt: CREATED,
        },
      ],
      notifications: [
        { id: 'f00000000000000000000001', userId: ALICE, createdAt: CREATED },
        { id: 'f00000000000000000000002', userId: BOB, createdAt: CREATED },
      ],
    });
    const admin = adminFixture();
    ADMIN = admin.ADMIN;
    sms = new FakeSmsSender();
    logs = [];
    app = createApp(
      createTestDependencies({
        userRepository: users,
        collectionRepository: collections,
        adminRepository: admin.adminRepository,
        smsSender: sms,
        adminLog: (line) => logs.push(line),
        now: () => NOW,
      }),
    );
  });

  const get = (path: string) => request(app).get(path).set('Authorization', ADMIN);
  const post = (path: string, body?: object) =>
    request(app).post(path).set('Authorization', ADMIN).send(body);
  const patch = (path: string, body: unknown) =>
    request(app)
      .patch(path)
      .set('Authorization', ADMIN)
      .send(body as object);

  const aliceJson = {
    id: ALICE,
    phone: '09120000001',
    firstName: 'Ali',
    lastName: 'Rezaei',
    birthDate: '1990-05-06',
    blockedAt: null,
    blockReason: null,
    createdAt: CREATED.toISOString(),
    vehicleCount: 1,
  };

  it.each([
    ['get', '/api/admin/users'],
    ['get', `/api/admin/users/${ALICE}`],
    ['patch', `/api/admin/users/${ALICE}`],
    ['post', `/api/admin/users/${ALICE}/block`],
    ['post', `/api/admin/users/${ALICE}/unblock`],
  ] as const)('%s %s returns 401 without an admin token', async (method, path) => {
    await request(app)[method](path).expect(401);
  });

  describe('GET /', () => {
    it('lists users newest id first, as AdminUser', async () => {
      const res = await get('/api/admin/users').expect(200);

      expect(res.body.users.map((u: { id: string }) => u.id)).toEqual([CAROL, BOB, ALICE]);
      expect(res.body.users[2]).toEqual(aliceJson);
      expect(res.body.nextCursor).toBeNull();
    });

    it('pages with cursor and limit', async () => {
      const first = await get('/api/admin/users?limit=2').expect(200);
      expect(first.body.users.map((u: { id: string }) => u.id)).toEqual([CAROL, BOB]);
      expect(first.body.nextCursor).toBe(BOB);

      const second = await get(`/api/admin/users?limit=2&cursor=${BOB}`).expect(200);
      expect(second.body.users.map((u: { id: string }) => u.id)).toEqual([ALICE]);
      expect(second.body.nextCursor).toBeNull();
    });

    it.each([
      ['0935', [BOB]],
      ['rezaei', [ALICE]],
      ['BIT', [BOB]],
      ['۰۹۱۲', [CAROL, ALICE]],
    ])('searches phone and names with %j', async (search, ids) => {
      const res = await get(`/api/admin/users?search=${encodeURIComponent(search)}`).expect(200);

      expect(res.body.users.map((u: { id: string }) => u.id)).toEqual(ids);
    });

    it.each(['limit=0', 'limit=101', 'limit=x', 'cursor=nope'])(
      'returns 400 for %s',
      async (query) => {
        await get(`/api/admin/users?${query}`).expect(400);
      },
    );
  });

  describe('GET /:id', () => {
    it('returns the user, vehicles with record counts, transfers and the notification count', async () => {
      const res = await get(`/api/admin/users/${ALICE}`).expect(200);

      expect(res.body.user).toEqual(aliceJson);
      expect(res.body.vehicles).toEqual([
        {
          id: VEHICLE,
          userId: ALICE,
          nickname: 'Pride',
          plate,
          vin: null,
          makeId: 'saipa',
          modelId: 'pride',
          trimId: null,
          yearJalali: 1395,
          mileageKm: 1000,
          color: null,
          isDefault: true,
          ownedSince: null,
          createdAt: CREATED.toISOString(),
          updatedAt: CREATED.toISOString(),
          counts: { serviceVisits: 0, fuelLogs: 2, expenses: 0, odometerReadings: 0, documents: 1 },
        },
      ]);
      expect(res.body.transfers.map((t: { id: string }) => t.id)).toEqual([
        'e00000000000000000000002',
        'e00000000000000000000001',
      ]);
      expect(Object.keys(res.body.transfers[0])).toEqual([
        'id',
        'vehicleId',
        'fromUserId',
        'toPhone',
        'status',
        'createdAt',
        'respondedAt',
      ]);
      expect(res.body.notificationCount).toBe(1);
    });

    it.each([MISSING, 'not-an-id'])('returns 404 for %s', async (id) => {
      await get(`/api/admin/users/${id}`).expect(404);
    });
  });

  describe('PATCH /:id', () => {
    it('updates any of the profile fields and logs the edit', async () => {
      const res = await patch(`/api/admin/users/${CAROL}`, {
        firstName: ' Sara ',
        birthDate: '2000-01-31',
      }).expect(200);

      expect(res.body.user).toMatchObject({
        id: CAROL,
        firstName: 'Sara',
        lastName: null,
        birthDate: '2000-01-31',
      });
      expect(logs).toEqual([`admin edited user id=${CAROL} fields=firstName,birthDate`]);
    });

    it.each([
      ['an empty body', {}],
      ['phone', { phone: '09121111111' }],
      ['role', { firstName: 'A', role: 'admin' }],
      ['an empty name', { lastName: '  ' }],
      ['a future birth date', { birthDate: '2027-01-01' }],
      ['an invalid date', { birthDate: '2026-02-30' }],
      ['null', { firstName: null }],
    ])('returns 400 for %s', async (_name, body) => {
      const res = await patch(`/api/admin/users/${ALICE}`, body).expect(400);

      expect(res.body.error.message).toBe('Validation failed');
      expect(logs).toEqual([]);
    });

    it('returns 404 for an unknown user', async () => {
      await patch(`/api/admin/users/${MISSING}`, { firstName: 'A' }).expect(404);
    });
  });

  describe('block / unblock', () => {
    const USER_TOKEN = `Bearer ${new TokenService(TEST_JWT_SECRET, '30d').sign(ALICE)}`;

    it('blocks with a reason; repeating keeps blockedAt and replaces the reason', async () => {
      const first = await post(`/api/admin/users/${ALICE}/block`, { reason: 'spam' }).expect(200);
      expect(first.body.user).toMatchObject({ blockedAt: NOW.toISOString(), blockReason: 'spam' });

      await users.setBlock(ALICE, {
        blockedAt: new Date('2026-01-01T00:00:00Z'),
        blockReason: 'spam',
      });
      const again = await post(`/api/admin/users/${ALICE}/block`).expect(200);

      expect(again.body.user).toMatchObject({
        blockedAt: '2026-01-01T00:00:00.000Z',
        blockReason: null,
      });
      expect(logs).toEqual([`admin blocked user id=${ALICE}`, `admin blocked user id=${ALICE}`]);
    });

    it('returns 400 for a reason over 500 characters', async () => {
      await post(`/api/admin/users/${ALICE}/block`, { reason: 'x'.repeat(501) }).expect(400);
    });

    it('a blocked user gets the user_blocked 403 on user routes and on OTP request/verify', async () => {
      await post(`/api/admin/users/${ALICE}/block`, { reason: 'spam' }).expect(200);

      const route = await request(app)
        .get('/api/vehicles')
        .set('Authorization', USER_TOKEN)
        .expect(403);
      expect(route.body).toEqual(BLOCKED_BODY);

      const otp = await request(app)
        .post('/api/auth/otp/request')
        .send({ phone: '09120000001' })
        .expect(403);
      expect(otp.body).toEqual(BLOCKED_BODY);
      expect(sms.sent).toEqual([]);
    });

    it('a code sent before the block cannot sign in', async () => {
      await request(app).post('/api/auth/otp/request').send({ phone: '09120000001' }).expect(200);
      await post(`/api/admin/users/${ALICE}/block`).expect(200);

      const res = await request(app)
        .post('/api/auth/otp/verify')
        .send({ phone: '09120000001', code: '12345' })
        .expect(403);
      expect(res.body).toEqual(BLOCKED_BODY);
    });

    it('unblocks (repeatably) and the user gets in again', async () => {
      await post(`/api/admin/users/${ALICE}/block`, { reason: 'spam' }).expect(200);

      const res = await post(`/api/admin/users/${ALICE}/unblock`).expect(200);
      await post(`/api/admin/users/${ALICE}/unblock`).expect(200);

      expect(res.body.user).toMatchObject({ blockedAt: null, blockReason: null });
      await request(app).get('/api/vehicles').set('Authorization', USER_TOKEN).expect(200);
      expect(logs.at(-1)).toBe(`admin unblocked user id=${ALICE}`);
    });

    it.each(['block', 'unblock'])('%s returns 404 for an unknown user', async (action) => {
      await post(`/api/admin/users/${MISSING}/${action}`).expect(404);
    });
  });
});
