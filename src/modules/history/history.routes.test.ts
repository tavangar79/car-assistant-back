import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { createGarage, type Garage } from '../../test/garage-fixture.ts';
import { createTestDependencies, TEST_JWT_SECRET } from '../../test/test-dependencies.ts';
import { TokenService } from '../auth/token.service.ts';
import { encodeCursor } from './history.types.ts';

const ALICE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const tokens = new TokenService(TEST_JWT_SECRET, '30d');
const ALICE = `Bearer ${tokens.sign(ALICE_ID)}`;
const NOW = new Date('2026-10-17T10:00:00Z');

describe('GET /api/history', () => {
  let app: ReturnType<typeof createApp>;
  let garage: Garage;
  let car: string;

  beforeEach(async () => {
    garage = createGarage(NOW);
    app = createApp(createTestDependencies({ ...garage.repositories, now: () => NOW }));
    car = await garage.addVehicle(ALICE_ID);
  });

  const get = (query: Record<string, string> = {}) =>
    request(app).get('/api/history').query(query).set('Authorization', ALICE);

  it('returns 401 without a token', async () => {
    await request(app).get('/api/history').expect(401);
  });

  it('returns 200 with entries, nextCursor and summary in the contract shape', async () => {
    const serviceId = await garage.addService(car, '2024-11-15T08:00:00.000Z', {
      engine_oil: 1130000,
    });
    const fuelId = await garage.addFuel(car, '2024-11-14T08:00:00.000Z', {
      volume: 48.5,
      totalCost: 145500,
    });
    const expenseId = await garage.addExpense(
      car,
      '2024-11-13T08:00:00.000Z',
      { amount: 5850000 },
      { attachment: true },
    );

    const res = await get().expect(200);

    expect(res.body).toEqual({
      entries: [
        {
          type: 'service',
          id: serviceId,
          vehicleId: car,
          occurredAt: '2024-11-15T08:00:00.000Z',
          cost: 1130000,
          hasAttachment: false,
          service: expect.objectContaining({ id: serviceId, invoice: null, invoiceUrl: null }),
          fuelLog: null,
          expense: null,
        },
        {
          type: 'fuel',
          id: fuelId,
          vehicleId: car,
          occurredAt: '2024-11-14T08:00:00.000Z',
          cost: 145500,
          hasAttachment: false,
          service: null,
          fuelLog: expect.objectContaining({ id: fuelId, volume: 48.5, economy: null }),
          expense: null,
        },
        {
          type: 'expense',
          id: expenseId,
          vehicleId: car,
          occurredAt: '2024-11-13T08:00:00.000Z',
          cost: 5850000,
          hasAttachment: true,
          service: null,
          fuelLog: null,
          expense: expect.objectContaining({
            id: expenseId,
            attachmentUrl: expect.stringContaining(`/api/vehicles/${car}/expenses/${expenseId}`),
          }),
        },
      ],
      nextCursor: null,
      summary: { totalCost: 7125500, serviceCount: 1, fuelVolume: 48.5, entryCount: 3 },
    });
  });

  it('follows nextCursor to the next page, which has a null summary', async () => {
    await garage.addFuel(car, '2026-01-01T08:00:00Z');
    const older = await garage.addFuel(car, '2025-01-01T08:00:00Z');

    const first = await get({ limit: '1' }).expect(200);
    const second = await get({ limit: '1', cursor: first.body.nextCursor }).expect(200);

    expect(second.body).toEqual({
      entries: [expect.objectContaining({ id: older })],
      nextCursor: null,
      summary: null,
    });
  });

  it('applies query filters', async () => {
    await garage.addFuel(car, '2026-01-01T08:00:00Z');
    const visit = await garage.addService(car, '2026-02-01T08:00:00Z', { engine_oil: 1 });

    const res = await get({ vehicleIds: car, type: 'service', categories: 'fluids' }).expect(200);

    expect(res.body.entries.map((entry: { id: string }) => entry.id)).toEqual([visit]);
  });

  it.each([
    ['type', { type: 'odometer' }],
    ['categories', { categories: 'fluids,tyres' }],
    ['hasAttachment', { hasAttachment: 'yes' }],
    ['from', { from: 'yesterday' }],
    ['from', { from: '2026-02-01T00:00:00Z', to: '2026-01-01T00:00:00Z' }],
    ['cursor', { cursor: 'not-a-cursor' }],
    ['limit', { limit: '0' }],
    ['limit', { limit: '101' }],
  ])('returns 400 with details.%s for %o', async (field, query) => {
    const res = await get(query).expect(400);
    expect(res.body.error.details).toHaveProperty(field);
  });

  it('accepts a cursor built from a date and an ObjectId', async () => {
    const cursor = encodeCursor({ occurredAt: NOW, id: 'f'.repeat(24) });
    await get({ cursor }).expect(200);
  });

  it("returns 404 for another user's vehicle or a malformed id", async () => {
    const bobs = await garage.addVehicle(BOB_ID, '999');
    await get({ vehicleIds: bobs }).expect(404);
    await get({ vehicleIds: `${car},nope` }).expect(404);
  });
});
