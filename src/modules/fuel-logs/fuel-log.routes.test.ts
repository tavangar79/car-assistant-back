import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { createTestDependencies, TEST_JWT_SECRET } from '../../test/test-dependencies.ts';
import { TokenService } from '../auth/token.service.ts';

const tokens = new TokenService(TEST_JWT_SECRET, '30d');
const ALICE = `Bearer ${tokens.sign('aaaaaaaaaaaaaaaaaaaaaaaa')}`;
const BOB = `Bearer ${tokens.sign('bbbbbbbbbbbbbbbbbbbbbbbb')}`;
const NOW = new Date('2026-10-17T10:00:00Z');
const ISO_DATE = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/);
const OBJECT_ID = expect.stringMatching(/^[a-f\d]{24}$/);
const UNKNOWN_ID = '0'.repeat(24);

const vehicleBody = {
  nickname: 'تارا',
  plate: { twoDigits: '72', letter: 'ب', threeDigits: '345', provinceCode: '68' },
  makeId: 'iran-khodro',
  modelId: 'tara',
  yearJalali: 1402,
  mileageKm: 34500,
};

const logBody = {
  fueledAt: '2025-11-15T13:12:00.000Z',
  odometerKm: 34850,
  fuelType: 'super',
  volume: 48.5,
  totalCost: 145500,
  isFullFill: true,
  station: 'جایگاه اختصاصی ۲۴ یادگار امام (تهران)',
  paymentMethod: 'personal_fuel_card',
  notes: 'استفاده از اکتان بوستر کاسپین (۱ عدد)',
};

describe('/api/vehicles/:id/fuel', () => {
  let app: ReturnType<typeof createApp>;
  let vehicleId: string;
  let path: string;

  beforeEach(async () => {
    app = createApp(createTestDependencies({ now: () => NOW }));
    const res = await request(app)
      .post('/api/vehicles')
      .set('Authorization', ALICE)
      .send(vehicleBody)
      .expect(201);
    vehicleId = res.body.id;
    path = `/api/vehicles/${vehicleId}/fuel`;
  });

  const post = (body: object, auth = ALICE) =>
    request(app).post(path).set('Authorization', auth).send(body);
  const create = async (body: object = logBody) =>
    (await post(body).expect(201)).body.fuelLog.id as string;
  const getVehicle = () =>
    request(app).get(`/api/vehicles/${vehicleId}`).set('Authorization', ALICE);

  it.each([
    ['get', ''],
    ['post', ''],
    ['get', `/${UNKNOWN_ID}`],
    ['patch', `/${UNKNOWN_ID}`],
    ['delete', `/${UNKNOWN_ID}`],
  ] as const)('%s %s returns 401 without a token', async (method, suffix) => {
    await request(app)[method](path + suffix).expect(401);
  });

  describe('POST', () => {
    it('returns 201 with the fuel log JSON and raises the vehicle mileage', async () => {
      const res = await post(logBody).expect(201);

      expect(res.body).toEqual({
        fuelLog: {
          id: OBJECT_ID,
          vehicleId,
          ...logBody,
          economy: null,
          locked: false,
          createdAt: ISO_DATE,
          updatedAt: ISO_DATE,
        },
      });
      expect((await getVehicle()).body.mileageKm).toBe(34850);
    });

    it('sends absent optional fields as null', async () => {
      const required = {
        fueledAt: logBody.fueledAt,
        odometerKm: logBody.odometerKm,
        fuelType: logBody.fuelType,
        volume: logBody.volume,
        totalCost: logBody.totalCost,
        isFullFill: logBody.isFullFill,
      };

      const res = await post(required).expect(201);

      expect(res.body.fuelLog).toMatchObject({ station: null, paymentMethod: null, notes: null });
    });

    it('returns the economy against the previous full fill', async () => {
      await post({ ...logBody, odometerKm: 34000, volume: 40 }).expect(201);

      const res = await post({
        ...logBody,
        fueledAt: '2025-11-20T13:12:00.000Z',
        odometerKm: 34500,
        volume: 37.3,
      }).expect(201);

      expect(res.body.fuelLog.economy).toBe(7.46);
    });

    it('leaves the mileage unchanged for a back-dated log with a lower odometer', async () => {
      await post({ ...logBody, odometerKm: 30000 }).expect(201);

      expect((await getVehicle()).body.mileageKm).toBe(34500);
    });

    it.each([
      ['missing fueledAt', { fueledAt: undefined }, 'fueledAt'],
      ['non-ISO fueledAt', { fueledAt: '15/11/2025' }, 'fueledAt'],
      ['negative odometerKm', { odometerKm: -1 }, 'odometerKm'],
      ['fractional odometerKm', { odometerKm: 1.5 }, 'odometerKm'],
      ['unknown fuelType', { fuelType: 'diesel' }, 'fuelType'],
      ['zero volume', { volume: 0 }, 'volume'],
      ['volume above 1000', { volume: 1000.01 }, 'volume'],
      ['volume with 3 decimals', { volume: 1.005 }, 'volume'],
      ['negative totalCost', { totalCost: -1 }, 'totalCost'],
      ['fractional totalCost', { totalCost: 1.5 }, 'totalCost'],
      ['missing isFullFill', { isFullFill: undefined }, 'isFullFill'],
      ['empty station', { station: '  ' }, 'station'],
      ['long station', { station: 'x'.repeat(101) }, 'station'],
      ['unknown paymentMethod', { paymentMethod: 'crypto' }, 'paymentMethod'],
      ['long notes', { notes: 'x'.repeat(501) }, 'notes'],
    ])('returns 400 for %s', async (_name, overrides, field) => {
      const res = await post({ ...logBody, ...overrides }).expect(400);

      expect(res.body.error.message).toBe('Validation failed');
      expect(res.body.error.details).toHaveProperty([field]);
    });

    it('returns 400 for a fueledAt in the future', async () => {
      const res = await post({ ...logBody, fueledAt: '2026-10-17T10:01:01Z' }).expect(400);

      expect(res.body.error.details).toEqual({ fueledAt: ['Must not be in the future'] });
    });

    it("returns 404 for another user's vehicle", async () => {
      const res = await post(logBody, BOB).expect(404);

      expect(res.body).toEqual({ error: { message: 'Vehicle not found' } });
    });

    it('returns 404 for a malformed vehicle id', async () => {
      await request(app)
        .post('/api/vehicles/nope/fuel')
        .set('Authorization', ALICE)
        .send(logBody)
        .expect(404);
    });
  });

  describe('GET list', () => {
    it('returns the logs newest fueledAt first', async () => {
      const older = await create({
        ...logBody,
        fueledAt: '2026-01-01T00:00:00Z',
        odometerKm: 1000,
      });
      const newer = await create({
        ...logBody,
        fueledAt: '2026-09-01T00:00:00Z',
        odometerKm: 1000,
      });

      const res = await request(app).get(path).set('Authorization', ALICE).expect(200);

      expect(res.body.fuelLogs.map((log: { id: string }) => log.id)).toEqual([newer, older]);
    });

    it('returns an empty list for a vehicle without logs', async () => {
      const res = await request(app).get(path).set('Authorization', ALICE).expect(200);

      expect(res.body).toEqual({ fuelLogs: [] });
    });

    it("returns 404 for another user's vehicle", async () => {
      await request(app).get(path).set('Authorization', BOB).expect(404);
    });
  });

  describe('GET one', () => {
    it('returns the log', async () => {
      const id = await create();

      const res = await request(app).get(`${path}/${id}`).set('Authorization', ALICE).expect(200);

      expect(res.body.fuelLog).toMatchObject({ id, vehicleId, volume: 48.5, economy: null });
    });

    it.each(['nope', UNKNOWN_ID])('returns 404 for id %s', async (id) => {
      const res = await request(app).get(`${path}/${id}`).set('Authorization', ALICE).expect(404);

      expect(res.body).toEqual({ error: { message: 'Fuel log not found' } });
    });

    it("returns 404 for another user's vehicle", async () => {
      const id = await create();

      await request(app).get(`${path}/${id}`).set('Authorization', BOB).expect(404);
    });
  });

  describe('PATCH', () => {
    it('returns 200 with the updated log', async () => {
      const id = await create();

      const res = await request(app)
        .patch(`${path}/${id}`)
        .set('Authorization', ALICE)
        .send({ volume: 50, fuelType: 'regular', notes: null })
        .expect(200);

      expect(res.body.fuelLog).toMatchObject({
        id,
        volume: 50,
        fuelType: 'regular',
        notes: null,
        station: logBody.station,
      });
    });

    it('returns 400 for an invalid field', async () => {
      const id = await create();

      const res = await request(app)
        .patch(`${path}/${id}`)
        .set('Authorization', ALICE)
        .send({ odometerKm: -1 })
        .expect(400);

      expect(res.body.error.details).toHaveProperty(['odometerKm']);
    });

    it.each(['nope', UNKNOWN_ID])('returns 404 for id %s', async (id) => {
      await request(app)
        .patch(`${path}/${id}`)
        .set('Authorization', ALICE)
        .send({ volume: 1 })
        .expect(404);
    });

    it("returns 404 for another user's vehicle", async () => {
      const id = await create();

      await request(app)
        .patch(`${path}/${id}`)
        .set('Authorization', BOB)
        .send({ volume: 1 })
        .expect(404);
    });
  });

  describe('DELETE', () => {
    it('returns 204 and the log is gone', async () => {
      const id = await create();

      await request(app).delete(`${path}/${id}`).set('Authorization', ALICE).expect(204);

      await request(app).get(`${path}/${id}`).set('Authorization', ALICE).expect(404);
    });

    it.each(['nope', UNKNOWN_ID])('returns 404 for id %s', async (id) => {
      await request(app).delete(`${path}/${id}`).set('Authorization', ALICE).expect(404);
    });

    it("returns 404 for another user's vehicle", async () => {
      const id = await create();

      await request(app).delete(`${path}/${id}`).set('Authorization', BOB).expect(404);
    });
  });

  it('deleting the vehicle deletes its logs', async () => {
    const id = await create();

    await request(app).delete(`/api/vehicles/${vehicleId}`).set('Authorization', ALICE).expect(204);

    await request(app).get(`${path}/${id}`).set('Authorization', ALICE).expect(404);
  });
});
