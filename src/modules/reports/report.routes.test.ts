import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { createGarage, type Garage } from '../../test/garage-fixture.ts';
import { createTestDependencies, TEST_JWT_SECRET } from '../../test/test-dependencies.ts';
import { TokenService } from '../auth/token.service.ts';
import { REPORT_TOO_LARGE } from './report.service.ts';

const ALICE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const tokens = new TokenService(TEST_JWT_SECRET, '30d');
const ALICE = `Bearer ${tokens.sign(ALICE_ID)}`;
const NOW = new Date('2026-10-17T10:00:00Z');

describe('GET /api/reports', () => {
  let garage: Garage;
  let car: string;

  const appWith = (reportMaxEntries = 5000) =>
    createApp(createTestDependencies({ ...garage.repositories, now: () => NOW, reportMaxEntries }));
  const get = (query: Record<string, string> = {}, app = appWith()) =>
    request(app).get('/api/reports').query(query).set('Authorization', ALICE);

  beforeEach(async () => {
    garage = createGarage(NOW);
    car = await garage.addVehicle(ALICE_ID);
  });

  it('returns 401 without a token', async () => {
    await request(appWith()).get('/api/reports').expect(401);
  });

  it('returns 200 with history-shaped entries oldest first and the summary', async () => {
    const expenseId = await garage.addExpense(
      car,
      '2024-11-13T08:00:00.000Z',
      { amount: 5850000 },
      { attachment: true },
    );
    const serviceId = await garage.addService(car, '2024-11-15T08:00:00.000Z', {
      engine_oil: 1130000,
    });

    const res = await get().expect(200);

    expect(res.body).toEqual({
      entries: [
        {
          type: 'expense',
          id: expenseId,
          vehicleId: car,
          occurredAt: '2024-11-13T08:00:00.000Z',
          cost: 5850000,
          hasAttachment: true,
          service: null,
          fuelLog: null,
          expense: expect.objectContaining({ id: expenseId, locked: false }),
        },
        {
          type: 'service',
          id: serviceId,
          vehicleId: car,
          occurredAt: '2024-11-15T08:00:00.000Z',
          cost: 1130000,
          hasAttachment: false,
          service: expect.objectContaining({ id: serviceId, locked: false }),
          fuelLog: null,
          expense: null,
        },
      ],
      summary: { totalCost: 6980000, serviceCount: 1, fuelVolume: 0, entryCount: 2 },
    });
  });

  it('filters by types and date range', async () => {
    await garage.addFuel(car, '2024-11-01T00:00:00.000Z');
    const fuel = await garage.addFuel(car, '2024-11-10T00:00:00.000Z');
    await garage.addExpense(car, '2024-11-10T00:00:00.000Z');

    const res = await get({ types: 'fuel', from: '2024-11-05T00:00:00.000Z' }).expect(200);

    expect(res.body.entries.map((entry: { id: string }) => entry.id)).toEqual([fuel]);
  });

  it('returns 404 when a vehicle is not the caller’s', async () => {
    const bobsCar = await garage.addVehicle(BOB_ID);
    await get({ vehicleIds: bobsCar }).expect(404);
    await get({ vehicleIds: 'not-an-id' }).expect(404);
  });

  it('returns 400 details.types for an empty or unknown type', async () => {
    const empty = await get({ types: '' }).expect(400);
    expect(empty.body.error.details).toEqual({ types: [expect.any(String)] });
    const unknown = await get({ types: 'service,odometer' }).expect(400);
    expect(unknown.body.error.details).toEqual({ types: [expect.any(String)] });
  });

  it('returns 400 details.from when from is after to', async () => {
    const res = await get({
      from: '2024-12-01T00:00:00.000Z',
      to: '2024-11-01T00:00:00.000Z',
    }).expect(400);
    expect(res.body.error.details).toEqual({ from: ['Must not be after to'] });
  });

  it('returns 422 above the entry cap', async () => {
    await garage.addFuel(car, '2024-11-01T00:00:00.000Z');
    await garage.addFuel(car, '2024-11-02T00:00:00.000Z');

    const res = await get({}, appWith(1)).expect(422);

    expect(res.body).toEqual({ error: { message: REPORT_TOO_LARGE } });
  });
});
