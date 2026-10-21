import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { createTestDependencies, TEST_JWT_SECRET } from '../../test/test-dependencies.ts';
import { TokenService } from '../auth/token.service.ts';
import { SERVICE_INTERVALS } from './service-interval.data.ts';

const tokens = new TokenService(TEST_JWT_SECRET, '30d');
const ALICE = `Bearer ${tokens.sign('aaaaaaaaaaaaaaaaaaaaaaaa')}`;
const BOB = `Bearer ${tokens.sign('bbbbbbbbbbbbbbbbbbbbbbbb')}`;
const NOW = new Date('2026-10-17T10:00:00Z');
const ISO_DATE = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/);

const vehicleBody = {
  nickname: 'تارا',
  plate: { twoDigits: '72', letter: 'ب', threeDigits: '345', provinceCode: '68' },
  makeId: 'iran-khodro',
  modelId: 'tara',
  yearJalali: 1402,
  mileageKm: 34500,
};

const DEFAULT_ENGINE_OIL = {
  id: 'engine_oil',
  title: 'روغن موتور و فیلتر روغن',
  description: 'تعویض روغن موتور به همراه فیلتر روغن',
  icon: 'oil_barrel',
  coversItemIds: ['engine_oil', 'oil_filter'],
  km: 5000,
  months: 6,
  defaultKm: 5000,
  defaultMonths: 6,
  isCustom: false,
};

describe('/api/vehicles/:id/intervals and /due', () => {
  let app: ReturnType<typeof createApp>;
  let vehicleId: string;
  let intervalsPath: string;
  let duePath: string;

  beforeEach(async () => {
    app = createApp(createTestDependencies({ now: () => NOW }));
    const res = await request(app)
      .post('/api/vehicles')
      .set('Authorization', ALICE)
      .send(vehicleBody)
      .expect(201);
    vehicleId = res.body.id;
    intervalsPath = `/api/vehicles/${vehicleId}/intervals`;
    duePath = `/api/vehicles/${vehicleId}/due`;
  });

  it.each([
    ['get', 'intervals'],
    ['put', 'intervals'],
    ['delete', 'intervals'],
    ['get', 'due'],
  ] as const)('%s /%s returns 401 without a token', async (method, suffix) => {
    await request(app)[method](`/api/vehicles/${vehicleId}/${suffix}`).expect(401);
  });

  describe('GET /intervals', () => {
    it('returns all 8 intervals with defaults', async () => {
      const res = await request(app).get(intervalsPath).set('Authorization', ALICE).expect(200);

      expect(res.body.intervals.map((i: { id: string }) => i.id)).toEqual(
        SERVICE_INTERVALS.map((d) => d.id),
      );
      expect(res.body.intervals[0]).toEqual(DEFAULT_ENGINE_OIL);
    });

    it("returns 404 for another user's vehicle", async () => {
      await request(app).get(intervalsPath).set('Authorization', BOB).expect(404);
    });
  });

  describe('PUT /intervals', () => {
    it('returns 200 with the full list after setting an override', async () => {
      const res = await request(app)
        .put(intervalsPath)
        .set('Authorization', ALICE)
        .send({ intervals: [{ id: 'engine_oil', km: 7000, months: 6 }] })
        .expect(200);

      expect(res.body.intervals).toHaveLength(8);
      expect(res.body.intervals[0]).toEqual({ ...DEFAULT_ENGINE_OIL, km: 7000, isCustom: true });
    });

    it.each([
      ['missing intervals', {}, 'intervals'],
      ['km below 500', { intervals: [{ id: 'engine_oil', km: 499, months: 6 }] }, 'intervals.0.km'],
      [
        'km above 200000',
        { intervals: [{ id: 'engine_oil', km: 200001, months: 6 }] },
        'intervals.0.km',
      ],
      [
        'months 0',
        { intervals: [{ id: 'engine_oil', km: 5000, months: 0 }] },
        'intervals.0.months',
      ],
      [
        'months above 120',
        { intervals: [{ id: 'engine_oil', km: 5000, months: 121 }] },
        'intervals.0.months',
      ],
      [
        'fractional km',
        { intervals: [{ id: 'engine_oil', km: 5000.5, months: 6 }] },
        'intervals.0.km',
      ],
    ])('returns 400 for %s', async (_name, body, field) => {
      const res = await request(app)
        .put(intervalsPath)
        .set('Authorization', ALICE)
        .send(body)
        .expect(400);

      expect(res.body.error.details).toHaveProperty([field]);
    });

    it('returns 400 for an unknown id', async () => {
      const res = await request(app)
        .put(intervalsPath)
        .set('Authorization', ALICE)
        .send({ intervals: [{ id: 'nope', km: 5000, months: 6 }] })
        .expect(400);

      expect(res.body.error.details).toEqual({ intervals: ['Unknown interval: nope'] });
    });

    it("returns 404 for another user's vehicle", async () => {
      await request(app)
        .put(intervalsPath)
        .set('Authorization', BOB)
        .send({ intervals: [{ id: 'engine_oil', km: 7000, months: 6 }] })
        .expect(404);
    });
  });

  describe('DELETE /intervals', () => {
    it('returns 200 with every interval back to default', async () => {
      await request(app)
        .put(intervalsPath)
        .set('Authorization', ALICE)
        .send({
          intervals: [
            { id: 'engine_oil', km: 7000, months: 6 },
            { id: 'coolant', km: 20000, months: 12 },
          ],
        })
        .expect(200);

      const res = await request(app).delete(intervalsPath).set('Authorization', ALICE).expect(200);

      expect(res.body.intervals).toHaveLength(8);
      expect(res.body.intervals.every((i: { isCustom: boolean }) => !i.isCustom)).toBe(true);
    });
  });

  describe('GET /due', () => {
    it('returns asOf, mileage and all 8 items sorted worst first', async () => {
      await request(app)
        .post(`/api/vehicles/${vehicleId}/services`)
        .set('Authorization', ALICE)
        .send({
          serviceDate: '2026-10-01T00:00:00Z',
          odometerKm: 30000,
          workshop: 'x',
          lineItems: [{ itemId: 'engine_oil', cost: 1, nextDueKm: 4000 }],
        })
        .expect(201);

      const res = await request(app).get(duePath).set('Authorization', ALICE).expect(200);

      expect(res.body.asOf).toBe(NOW.toISOString());
      expect(res.body.mileageKm).toBe(34500);
      expect(res.body.items).toHaveLength(8);
      expect(res.body.items[0]).toEqual({
        intervalId: 'engine_oil',
        title: 'روغن موتور و فیلتر روغن',
        description: 'تعویض روغن موتور به همراه فیلتر روغن',
        icon: 'oil_barrel',
        coversItemIds: ['engine_oil', 'oil_filter'],
        status: 'overdue',
        baselineKm: 30000,
        baselineDate: '2026-10-01T00:00:00.000Z',
        baselineServiceId: expect.stringMatching(/^[a-f\d]{24}$/),
        dueKm: 34000,
        dueDate: '2027-04-01T00:00:00.000Z',
        remainingKm: -500,
        remainingDays: 165,
      });
      expect(res.body.items[1].baselineServiceId).toBeNull();
      expect(res.body.items[1].baselineDate).toEqual(ISO_DATE);
    });

    it("returns 404 for another user's vehicle", async () => {
      await request(app).get(duePath).set('Authorization', BOB).expect(404);
    });
  });
});
