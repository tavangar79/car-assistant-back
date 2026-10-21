import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { createGarage } from '../../test/garage-fixture.ts';
import { createTestDependencies, TEST_JWT_SECRET } from '../../test/test-dependencies.ts';
import { TokenService } from '../auth/token.service.ts';

const ALICE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ALICE = `Bearer ${new TokenService(TEST_JWT_SECRET, '30d').sign(ALICE_ID)}`;
const NOW = new Date('2026-10-17T10:00:00Z');

describe('GET /api/profile/stats', () => {
  it('returns 401 without a token', async () => {
    await request(createApp(createTestDependencies())).get('/api/profile/stats').expect(401);
  });

  it('returns 200 with only the vehicle and service counts', async () => {
    const garage = createGarage(NOW);
    const app = createApp(createTestDependencies({ ...garage.repositories, now: () => NOW }));
    const car = await garage.addVehicle(ALICE_ID);
    await garage.addService(car, '2026-01-01T08:00:00Z', { battery: 1 });

    const res = await request(app)
      .get('/api/profile/stats')
      .set('Authorization', ALICE)
      .expect(200);

    expect(res.body).toEqual({ stats: { vehicleCount: 1, serviceCount: 1 } });
  });
});
