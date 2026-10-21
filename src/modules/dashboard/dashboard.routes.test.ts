import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { createGarage, type Garage } from '../../test/garage-fixture.ts';
import { createTestDependencies, TEST_JWT_SECRET } from '../../test/test-dependencies.ts';
import { TokenService } from '../auth/token.service.ts';

const ALICE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ALICE = `Bearer ${new TokenService(TEST_JWT_SECRET, '30d').sign(ALICE_ID)}`;
const NOW = new Date('2026-10-17T10:00:00Z');

describe('GET /api/dashboard', () => {
  let app: ReturnType<typeof createApp>;
  let garage: Garage;

  beforeEach(() => {
    garage = createGarage(NOW);
    app = createApp(createTestDependencies({ ...garage.repositories, now: () => NOW }));
  });

  it('returns 401 without a token', async () => {
    await request(app).get('/api/dashboard').expect(401);
  });

  it('returns 200 with the dashboard in the contract shape', async () => {
    const car = await garage.addVehicle(ALICE_ID);
    await garage.addService(car, '2026-10-01T08:00:00Z', { battery: 800000 }, { invoice: true });

    const res = await request(app).get('/api/dashboard').set('Authorization', ALICE).expect(200);

    expect(res.body.dashboard).toEqual({
      jalaliYear: 1405,
      yearTotalCost: 800000,
      invoiceCount: 1,
      attentionCount: 2,
      vehicles: [{ vehicleId: car, attentionCount: 2, yearTotalCost: 800000 }],
      months: expect.any(Array),
    });
    expect(res.body.dashboard.months).toHaveLength(6);
    expect(res.body.dashboard.months.at(-1)).toEqual({
      jalaliYear: 1405,
      jalaliMonth: 7,
      from: '2026-09-22T20:30:00.000Z',
      to: '2026-10-22T20:30:00.000Z',
      totalCost: 800000,
      byVehicle: [{ vehicleId: car, totalCost: 800000 }],
    });
  });

  it('returns zeros and empty lists for an empty garage', async () => {
    const res = await request(app).get('/api/dashboard').set('Authorization', ALICE).expect(200);

    expect(res.body.dashboard).toMatchObject({
      yearTotalCost: 0,
      invoiceCount: 0,
      attentionCount: 0,
      vehicles: [],
    });
    for (const month of res.body.dashboard.months) {
      expect(month).toMatchObject({ totalCost: 0, byVehicle: [] });
    }
  });
});
