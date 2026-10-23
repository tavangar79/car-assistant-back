import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { createGarage, type Garage } from '../../test/garage-fixture.ts';
import { InMemoryUserRepository } from '../../test/in-memory-user.repository.ts';
import { createTestDependencies, TEST_JWT_SECRET } from '../../test/test-dependencies.ts';
import { TokenService } from '../auth/token.service.ts';
import { BUYER_HAS_PLATE, SELF_TRANSFER } from './transfer.service.ts';

const tokens = new TokenService(TEST_JWT_SECRET, '30d');
const NOW = new Date('2026-10-17T10:00:00Z');
const SELLER_PHONE = '09120000001';
const BUYER_PHONE = '09120000002';

describe('/api/transfers', () => {
  let app: ReturnType<typeof createApp>;
  let garage: Garage;
  let car: string;
  let SELLER: string;
  let BUYER: string;
  let buyerId: string;

  beforeEach(async () => {
    garage = createGarage(NOW);
    const users = new InMemoryUserRepository();
    app = createApp(
      createTestDependencies({ ...garage.repositories, userRepository: users, now: () => NOW }),
    );
    const seller = await users.updateProfile((await users.create(SELLER_PHONE)).id, {
      firstName: 'علی',
      lastName: 'رضایی',
      birthDate: new Date('1990-01-01T00:00:00Z'),
    });
    buyerId = (await users.create(BUYER_PHONE)).id;
    SELLER = `Bearer ${tokens.sign(seller.id)}`;
    BUYER = `Bearer ${tokens.sign(buyerId)}`;
    car = await garage.addVehicle(seller.id, '345', 42300);
  });

  const send = (phone: unknown, vehicleId = car, auth = SELLER) =>
    request(app)
      .post(`/api/vehicles/${vehicleId}/transfers`)
      .set('Authorization', auth)
      .send({ phone });
  const createTransfer = async () =>
    (await send(BUYER_PHONE).expect(201)).body.transfer.id as string;

  describe('POST /api/vehicles/:id/transfers', () => {
    it('returns 201 with the transfer JSON, normalizing the phone', async () => {
      const res = await send('+98 912 000 0002').expect(201);

      expect(res.body).toEqual({
        transfer: {
          id: expect.stringMatching(/^[a-f\d]{24}$/),
          vehicleId: car,
          toPhone: BUYER_PHONE,
          status: 'pending',
          createdAt: expect.any(String),
          respondedAt: null,
          vehicle: {
            nickname: 'تارا',
            makeId: 'iran-khodro',
            modelId: 'tara',
            trimId: null,
            yearJalali: 1402,
            plate: { twoDigits: '72', letter: 'ب', threeDigits: '345', provinceCode: '68' },
            mileageKm: 42300,
          },
          fromName: 'علی رضایی',
        },
      });
    });

    it('returns 400 details.phone for an invalid phone', async () => {
      const res = await send('12345').expect(400);
      expect(res.body.error.details).toEqual({ phone: [expect.any(String)] });
      await send(undefined).expect(400);
    });

    it('returns 422 details.phone for the seller’s own phone', async () => {
      const res = await send(SELLER_PHONE).expect(422);
      expect(res.body.error.details).toEqual({ phone: [SELF_TRANSFER] });
    });

    it('returns 409 when a transfer is already pending', async () => {
      await createTransfer();
      await send('09350000000').expect(409);
    });

    it('returns 404 for another user’s vehicle or a malformed id', async () => {
      await send(SELLER_PHONE, car, BUYER).expect(404);
      await send(BUYER_PHONE, 'nope').expect(404);
    });

    it('returns 401 without a token', async () => {
      await request(app).post(`/api/vehicles/${car}/transfers`).send({}).expect(401);
    });
  });

  describe('GET /api/transfers', () => {
    it('lists the transfer as incoming for the buyer and outgoing for the seller', async () => {
      const id = await createTransfer();

      const buyer = await request(app)
        .get('/api/transfers')
        .set('Authorization', BUYER)
        .expect(200);
      const seller = await request(app)
        .get('/api/transfers')
        .set('Authorization', SELLER)
        .expect(200);

      expect(buyer.body).toEqual({ incoming: [expect.objectContaining({ id })], outgoing: [] });
      expect(seller.body).toEqual({ incoming: [], outgoing: [expect.objectContaining({ id })] });
    });
  });

  describe('DELETE /api/transfers/:id', () => {
    it('lets only the seller cancel (204), then it is gone', async () => {
      const id = await createTransfer();

      await request(app).delete(`/api/transfers/${id}`).set('Authorization', BUYER).expect(404);
      await request(app).delete(`/api/transfers/${id}`).set('Authorization', SELLER).expect(204);
      await request(app).delete(`/api/transfers/${id}`).set('Authorization', SELLER).expect(404);
    });
  });

  describe('POST /api/transfers/:id/reject', () => {
    it('lets only the buyer reject (204)', async () => {
      const id = await createTransfer();

      await request(app)
        .post(`/api/transfers/${id}/reject`)
        .set('Authorization', SELLER)
        .expect(404);
      await request(app)
        .post(`/api/transfers/${id}/reject`)
        .set('Authorization', BUYER)
        .expect(204);
    });
  });

  describe('POST /api/transfers/:id/accept', () => {
    it('returns 200 with the vehicle JSON, now the buyer’s', async () => {
      const id = await createTransfer();

      await request(app)
        .post(`/api/transfers/${id}/accept`)
        .set('Authorization', SELLER)
        .expect(404);
      const res = await request(app)
        .post(`/api/transfers/${id}/accept`)
        .set('Authorization', BUYER)
        .expect(200);

      expect(res.body.vehicle).toMatchObject({
        id: car,
        isDefault: true,
        ownedSince: NOW.toISOString(),
      });
      await request(app).get(`/api/vehicles/${car}`).set('Authorization', BUYER).expect(200);
      await request(app).get(`/api/vehicles/${car}`).set('Authorization', SELLER).expect(404);
    });

    it('returns 409 when the buyer already has a vehicle with the same plate', async () => {
      await garage.addVehicle(buyerId, '345');
      const id = await createTransfer();

      const res = await request(app)
        .post(`/api/transfers/${id}/accept`)
        .set('Authorization', BUYER)
        .expect(409);

      expect(res.body).toEqual({ error: { message: BUYER_HAS_PLATE } });
    });

    it('returns 409 when the vehicle was deleted meanwhile', async () => {
      const id = await createTransfer();
      await request(app).delete(`/api/vehicles/${car}`).set('Authorization', SELLER).expect(204);

      await request(app)
        .post(`/api/transfers/${id}/accept`)
        .set('Authorization', BUYER)
        .expect(409);
    });
  });
});
