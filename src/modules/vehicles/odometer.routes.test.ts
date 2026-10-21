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

const vehicleBody = {
  nickname: 'تارا',
  plate: { twoDigits: '72', letter: 'ب', threeDigits: '345', provinceCode: '68' },
  makeId: 'iran-khodro',
  modelId: 'tara',
  yearJalali: 1402,
  mileageKm: 34500,
};

describe('/api/vehicles/:id/odometer', () => {
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
    path = `/api/vehicles/${vehicleId}/odometer`;
  });

  const post = (body: object, auth = ALICE) =>
    request(app).post(path).set('Authorization', auth).send(body);

  it.each(['get', 'post'] as const)('%s returns 401 without a token', async (method) => {
    await request(app)[method](path).expect(401);
  });

  describe('POST', () => {
    it('returns 201 with the reading and the updated vehicle', async () => {
      const res = await post({ mileageKm: 35000, recordedAt: '2026-10-16T08:00:00.000Z' }).expect(
        201,
      );

      expect(res.body.reading).toEqual({
        id: OBJECT_ID,
        vehicleId,
        mileageKm: 35000,
        recordedAt: '2026-10-16T08:00:00.000Z',
        createdAt: ISO_DATE,
      });
      const vehicle = await request(app)
        .get(`/api/vehicles/${vehicleId}`)
        .set('Authorization', ALICE)
        .expect(200);
      expect(vehicle.body.mileageKm).toBe(35000);
      expect(res.body.vehicle).toEqual(vehicle.body);
    });

    it('defaults recordedAt to now', async () => {
      const res = await post({ mileageKm: 35000 }).expect(201);

      expect(res.body.reading.recordedAt).toBe(NOW.toISOString());
    });

    it('accepts a recordedAt with a time zone offset', async () => {
      const res = await post({ mileageKm: 35000, recordedAt: '2026-10-16T11:30:00+03:30' }).expect(
        201,
      );

      expect(res.body.reading.recordedAt).toBe('2026-10-16T08:00:00.000Z');
    });

    it('accepts the same mileage as the current one', async () => {
      const res = await post({ mileageKm: 34500 }).expect(201);

      expect(res.body.vehicle.mileageKm).toBe(34500);
    });

    it('returns 422 with the current mileage when the reading is lower', async () => {
      const res = await post({ mileageKm: 34499 }).expect(422);

      expect(res.body).toEqual({
        error: {
          message: 'Mileage cannot be lower than the current reading',
          details: { currentMileageKm: 34500 },
        },
      });
    });

    it.each([
      ['missing mileageKm', {}, 'mileageKm'],
      ['negative mileageKm', { mileageKm: -1 }, 'mileageKm'],
      ['fractional mileageKm', { mileageKm: 35000.5 }, 'mileageKm'],
      ['too large mileageKm', { mileageKm: 2_000_001 }, 'mileageKm'],
      ['string mileageKm', { mileageKm: '35000' }, 'mileageKm'],
      ['non-ISO recordedAt', { mileageKm: 35000, recordedAt: '16/10/2026' }, 'recordedAt'],
    ])('returns 400 for %s', async (_name, body, field) => {
      const res = await post(body).expect(400);

      expect(res.body.error.message).toBe('Validation failed');
      expect(res.body.error.details).toHaveProperty([field]);
    });

    it('accepts the largest mileage', async () => {
      await post({ mileageKm: 2_000_000 }).expect(201);
    });

    it('returns 400 for a recordedAt more than 1 minute in the future', async () => {
      const res = await post({ mileageKm: 35000, recordedAt: '2026-10-17T10:01:01Z' }).expect(400);

      expect(res.body).toEqual({
        error: {
          message: 'Validation failed',
          details: { recordedAt: ['Must not be in the future'] },
        },
      });
    });

    it("returns 404 for another user's vehicle and leaves it unchanged", async () => {
      const res = await post({ mileageKm: 35000 }, BOB).expect(404);

      expect(res.body).toEqual({ error: { message: 'Vehicle not found' } });
      const vehicle = await request(app)
        .get(`/api/vehicles/${vehicleId}`)
        .set('Authorization', ALICE);
      expect(vehicle.body.mileageKm).toBe(34500);
    });

    it('returns 404 for a malformed id', async () => {
      await request(app)
        .post('/api/vehicles/nope/odometer')
        .set('Authorization', ALICE)
        .send({ mileageKm: 35000 })
        .expect(404);
    });
  });

  describe('GET', () => {
    it('returns readings by recordedAt desc, then createdAt desc', async () => {
      const record = async (mileageKm: number, recordedAt: string) =>
        (await post({ mileageKm, recordedAt }).expect(201)).body.reading.id as string;
      const oldest = await record(35000, '2026-09-01T00:00:00Z');
      const middle = await record(36000, '2026-10-10T00:00:00Z');
      const sameTimeLater = await record(36000, '2026-10-10T00:00:00Z');
      const backDated = await record(36500, '2026-10-01T00:00:00Z');

      const res = await request(app).get(path).set('Authorization', ALICE).expect(200);

      expect(res.body.readings.map((r: { id: string }) => r.id)).toEqual([
        sameTimeLater,
        middle,
        backDated,
        oldest,
      ]);
      expect(res.body.readings[0]).toEqual({
        id: sameTimeLater,
        vehicleId,
        mileageKm: 36000,
        recordedAt: '2026-10-10T00:00:00.000Z',
        createdAt: ISO_DATE,
      });
    });

    it('returns an empty list for a vehicle without readings', async () => {
      const res = await request(app).get(path).set('Authorization', ALICE).expect(200);

      expect(res.body).toEqual({ readings: [] });
    });

    it("returns 404 for another user's vehicle", async () => {
      await request(app).get(path).set('Authorization', BOB).expect(404);
    });
  });
});
