import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { createGarage, type Garage } from '../../test/garage-fixture.ts';
import { JPEG_BYTES } from '../../test/image-fixtures.ts';
import { createTestDependencies, TEST_JWT_SECRET } from '../../test/test-dependencies.ts';
import { TokenService } from '../auth/token.service.ts';
import { LOCKED_RECORD } from './record-lock.ts';

const SELLER_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BUYER_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const BUYER = `Bearer ${new TokenService(TEST_JWT_SECRET, '30d').sign(BUYER_ID)}`;
const NOW = new Date('2026-10-17T10:00:00Z');
const LOCKED_BODY = { error: { message: LOCKED_RECORD } };

/** Records the seller created, then the vehicle moved to the buyer (as an accepted transfer does). */
describe('records of a previous owner', () => {
  let app: ReturnType<typeof createApp>;
  let garage: Garage;
  let car: string;
  let serviceId: string;
  let fuelId: string;
  let expenseId: string;

  beforeEach(async () => {
    garage = createGarage(NOW);
    app = createApp(createTestDependencies({ ...garage.repositories, now: () => NOW }));
    car = await garage.addVehicle(SELLER_ID);
    serviceId = await garage.addService(car, '2026-01-10T08:00:00.000Z', { engine_oil: 1000 });
    fuelId = await garage.addFuel(car, '2026-01-11T08:00:00.000Z');
    expenseId = await garage.addExpense(car, '2026-01-12T08:00:00.000Z');
    await garage.repositories.vehicleRepository.changeOwner(car, {
      userId: BUYER_ID,
      ownedSince: NOW,
      isDefault: true,
    });
  });

  const as = () => ({
    get: (path: string) => request(app).get(path).set('Authorization', BUYER),
    patch: (path: string, body: object) =>
      request(app).patch(path).set('Authorization', BUYER).send(body),
    delete: (path: string) => request(app).delete(path).set('Authorization', BUYER),
    put: (path: string, field: string) =>
      request(app)
        .put(path)
        .set('Authorization', BUYER)
        .attach(field, JPEG_BYTES, { filename: 'a.jpg', contentType: 'image/jpeg' }),
  });

  const servicePath = () => `/api/vehicles/${car}/services/${serviceId}`;
  const fuelPath = () => `/api/vehicles/${car}/fuel/${fuelId}`;
  const expensePath = () => `/api/vehicles/${car}/expenses/${expenseId}`;

  it('shows locked: true on each record and in history and report entries', async () => {
    expect((await as().get(servicePath()).expect(200)).body.service.locked).toBe(true);
    expect((await as().get(fuelPath()).expect(200)).body.fuelLog.locked).toBe(true);
    expect((await as().get(expensePath()).expect(200)).body.expense.locked).toBe(true);

    for (const path of ['/api/history', '/api/reports']) {
      const { entries } = (await as().get(path).expect(200)).body;
      const locks = entries.map(
        (e: {
          service?: { locked: boolean };
          fuelLog?: { locked: boolean };
          expense?: { locked: boolean };
        }) => (e.service ?? e.fuelLog ?? e.expense)!.locked,
      );
      expect(locks).toEqual([true, true, true]);
    }
  });

  it('returns 403 on PATCH, DELETE and invoice writes of a locked service visit', async () => {
    expect((await as().patch(servicePath(), { workshop: 'x' }).expect(403)).body).toEqual(
      LOCKED_BODY,
    );
    await as().put(`${servicePath()}/invoice`, 'invoice').expect(403);
    await as().delete(`${servicePath()}/invoice`).expect(403);
    await as().delete(servicePath()).expect(403);
    expect(garage.repositories.serviceVisitRepository.visits.has(serviceId)).toBe(true);
  });

  it('returns 403 on PATCH and DELETE of a locked fuel log', async () => {
    expect((await as().patch(fuelPath(), { volume: 10 }).expect(403)).body).toEqual(LOCKED_BODY);
    await as().delete(fuelPath()).expect(403);
  });

  it('returns 403 on PATCH, DELETE and attachment writes of a locked expense', async () => {
    expect((await as().patch(expensePath(), { amount: 10 }).expect(403)).body).toEqual(LOCKED_BODY);
    await as().put(`${expensePath()}/attachment`, 'attachment').expect(403);
    await as().delete(`${expensePath()}/attachment`).expect(403);
    await as().delete(expensePath()).expect(403);
  });

  it('still lets the new owner read a locked record’s invoice', async () => {
    await garage.repositories.serviceInvoiceRepository.save(serviceId, {
      fileName: 'invoice.jpg',
      contentType: 'image/jpeg',
      data: JPEG_BYTES,
    });
    await as().get(`${servicePath()}/invoice`).expect(200);
  });

  it('leaves records the new owner creates unlocked and editable', async () => {
    // The fake stamps createdAt from a 1 ms clock starting 2026-01-01: the seeded log got +0 ms,
    // the next one gets +1 ms. Transfer in between.
    await garage.repositories.vehicleRepository.changeOwner(car, {
      userId: BUYER_ID,
      ownedSince: new Date('2026-01-01T00:00:00.001Z'),
      isDefault: true,
    });
    await as().patch(fuelPath(), { volume: 10 }).expect(403);

    const created = await request(app)
      .post(`/api/vehicles/${car}/fuel`)
      .set('Authorization', BUYER)
      .send({
        fueledAt: '2026-10-17T09:00:00.000Z',
        odometerKm: 40000,
        fuelType: 'super',
        volume: 30,
        totalCost: 90000,
        isFullFill: true,
      })
      .expect(201);
    expect(created.body.fuelLog.locked).toBe(false);

    await as()
      .patch(`/api/vehicles/${car}/fuel/${created.body.fuelLog.id}`, { volume: 31 })
      .expect(200);
  });
});
