import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { InMemoryUserRepository } from '../../test/in-memory-user.repository.ts';
import { createTestDependencies, TEST_JWT_SECRET } from '../../test/test-dependencies.ts';
import { ADMIN_ONLY } from '../auth/require-admin.ts';
import { TokenService } from '../auth/token.service.ts';
import { GLOBAL_DELETE } from './catalog-admin.service.ts';

const tokens = new TokenService(TEST_JWT_SECRET, '30d');
const ISO_DATE = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/);
const GLOBAL = { makeId: null, modelId: null, trimId: null };
const TARA = { makeId: 'iran-khodro', modelId: 'tara', trimId: null };
const MISSING_ID = 'cccccccccccccccccccccccc';

const itemBody = {
  itemId: 'engine_oil',
  scope: TARA,
  categoryId: 'fluids',
  title: 'روغن موتور تارا',
  subtitle: 'زیرعنوان',
  icon: 'oil_barrel',
  sortOrder: 5,
};

const intervalBody = {
  intervalId: 'engine_oil',
  scope: TARA,
  title: 'روغن موتور',
  description: 'توضیح',
  icon: 'oil_barrel',
  coversItemIds: ['engine_oil', 'oil_filter'],
  km: 8000,
  months: 12,
  sortOrder: 0,
};

const vehicleBody = (threeDigits: string, modelId: string) => ({
  nickname: 'ماشین',
  plate: { twoDigits: '72', letter: 'ب', threeDigits, provinceCode: '68' },
  makeId: 'iran-khodro',
  modelId,
  yearJalali: 1402,
  mileageKm: 34500,
});

describe('/api/admin', () => {
  let app: ReturnType<typeof createApp>;
  let ADMIN: string;
  let USER: string;

  beforeEach(async () => {
    const users = new InMemoryUserRepository();
    const admin = await users.create('09120000001');
    await users.setRole(admin.id, 'admin');
    const user = await users.create('09120000002');
    ADMIN = `Bearer ${tokens.sign(admin.id)}`;
    USER = `Bearer ${tokens.sign(user.id)}`;
    app = createApp(createTestDependencies({ userRepository: users }));
  });

  const ROUTES = [
    ['get', '/api/admin/service-items'],
    ['post', '/api/admin/service-items'],
    ['patch', `/api/admin/service-items/${MISSING_ID}`],
    ['delete', `/api/admin/service-items/${MISSING_ID}`],
    ['get', '/api/admin/intervals'],
    ['post', '/api/admin/intervals'],
    ['patch', `/api/admin/intervals/${MISSING_ID}`],
    ['delete', `/api/admin/intervals/${MISSING_ID}`],
  ] as const;

  it.each(ROUTES)('%s %s returns 401 without a token', async (method, path) => {
    await request(app)[method](path).expect(401);
  });

  it.each(ROUTES)('%s %s returns 403 for a normal user', async (method, path) => {
    const res = await request(app)[method](path).set('Authorization', USER).send({}).expect(403);

    expect(res.body).toEqual({ error: { message: ADMIN_ONLY } });
  });

  describe('service items', () => {
    const create = (body: object) =>
      request(app).post('/api/admin/service-items').set('Authorization', ADMIN).send(body);

    it('GET lists every row in every scope', async () => {
      await create(itemBody).expect(201);

      const res = await request(app)
        .get('/api/admin/service-items')
        .set('Authorization', ADMIN)
        .expect(200);

      expect(res.body.items).toHaveLength(27);
      expect(res.body.items[0]).toEqual({
        id: expect.stringMatching(/^[a-f\d]{24}$/),
        itemId: 'air_filter',
        scope: GLOBAL,
        categoryId: 'fluids',
        title: 'فیلتر هوا',
        subtitle: 'مکش موتور',
        icon: 'air',
        sortOrder: 2,
        disabled: false,
        createdAt: ISO_DATE,
        updatedAt: ISO_DATE,
      });
    });

    it('POST creates a row (201), defaulting disabled to false', async () => {
      const res = await create(itemBody).expect(201);

      expect(res.body.item).toEqual({
        id: expect.any(String),
        ...itemBody,
        disabled: false,
        createdAt: ISO_DATE,
        updatedAt: ISO_DATE,
      });
    });

    it('POST returns 409 for the same itemId and scope', async () => {
      await create(itemBody).expect(201);
      await create(itemBody).expect(409);
      await create({ ...itemBody, scope: GLOBAL }).expect(409);
    });

    it.each([
      [{ itemId: 'Bad-Id' }, 'itemId'],
      [{ itemId: 'x' }, 'itemId'],
      [{ categoryId: 'nope' }, 'categoryId'],
      [{ title: ' ' }, 'title'],
      [{ sortOrder: 1.5 }, 'sortOrder'],
    ])('POST returns 400 for %j', async (patch, field) => {
      const res = await create({ ...itemBody, ...patch }).expect(400);

      expect(Object.keys(res.body.error.details)).toEqual([field]);
    });

    it.each([
      [{ makeId: 'nope', modelId: null, trimId: null }, 'Unknown make'],
      [{ makeId: 'saipa', modelId: 'tara', trimId: null }, 'Model does not belong to the make'],
      [{ makeId: 'iran-khodro', modelId: null, trimId: 'tara-v4-at' }, 'trimId requires modelId'],
    ])('POST returns 400 details.scope for %j', async (scope, message) => {
      const res = await create({ ...itemBody, scope }).expect(400);

      expect(res.body.error.details).toEqual({ scope: [message] });
    });

    it('PATCH changes editable fields and rejects itemId / scope', async () => {
      const { body } = await create(itemBody).expect(201);
      const path = `/api/admin/service-items/${body.item.id}`;

      const res = await request(app)
        .patch(path)
        .set('Authorization', ADMIN)
        .send({ title: 'جدید', disabled: true })
        .expect(200);
      expect(res.body.item).toMatchObject({ title: 'جدید', disabled: true, scope: TARA });

      const bad = await request(app)
        .patch(path)
        .set('Authorization', ADMIN)
        .send({ itemId: 'other', scope: GLOBAL })
        .expect(400);
      expect(bad.body.error.details).toEqual({
        itemId: ['Cannot be changed'],
        scope: ['Cannot be changed'],
      });
    });

    it('PATCH and DELETE return 404 for a missing or malformed id', async () => {
      await request(app)
        .patch(`/api/admin/service-items/${MISSING_ID}`)
        .set('Authorization', ADMIN)
        .send({ title: 'x' })
        .expect(404);
      await request(app)
        .delete('/api/admin/service-items/nope')
        .set('Authorization', ADMIN)
        .expect(404);
    });

    it('DELETE removes a scoped row (204) and refuses a global one (422)', async () => {
      const { body } = await create(itemBody).expect(201);
      await request(app)
        .delete(`/api/admin/service-items/${body.item.id}`)
        .set('Authorization', ADMIN)
        .expect(204);

      const list = await request(app).get('/api/admin/service-items').set('Authorization', ADMIN);
      const global = list.body.items.find((r: { itemId: string }) => r.itemId === 'engine_oil');
      const res = await request(app)
        .delete(`/api/admin/service-items/${global.id}`)
        .set('Authorization', ADMIN)
        .expect(422);
      expect(res.body.error.message).toBe(GLOBAL_DELETE);
    });
  });

  describe('intervals', () => {
    const create = (body: object) =>
      request(app).post('/api/admin/intervals').set('Authorization', ADMIN).send(body);

    it('GET lists every row', async () => {
      const res = await request(app)
        .get('/api/admin/intervals')
        .set('Authorization', ADMIN)
        .expect(200);

      expect(res.body.intervals).toHaveLength(8);
      expect(res.body.intervals[0]).toEqual({
        id: expect.any(String),
        intervalId: 'air_filter',
        scope: GLOBAL,
        title: 'فیلتر هوا و اتاق',
        description: 'تعویض فیلتر هوای موتور و فیلتر کابین',
        icon: 'air',
        coversItemIds: ['air_filter', 'cabin_filter'],
        km: 10000,
        months: 6,
        sortOrder: 1,
        disabled: false,
        createdAt: ISO_DATE,
        updatedAt: ISO_DATE,
      });
    });

    it('POST creates (201) and returns 409 for a duplicate', async () => {
      const res = await create(intervalBody).expect(201);
      expect(res.body.interval).toMatchObject({ ...intervalBody, disabled: false });

      await create(intervalBody).expect(409);
    });

    it.each([
      [{ km: 499 }, 'km'],
      [{ km: 200001 }, 'km'],
      [{ months: 0 }, 'months'],
      [{ months: 121 }, 'months'],
      [{ coversItemIds: [] }, 'coversItemIds'],
      [{ coversItemIds: ['nope'] }, 'coversItemIds'],
      [{ intervalId: 'A' }, 'intervalId'],
      [{ scope: { makeId: 'nope', modelId: null, trimId: null } }, 'scope'],
    ])('POST returns 400 for %j', async (patch, field) => {
      const res = await create({ ...intervalBody, ...patch }).expect(400);

      expect(Object.keys(res.body.error.details)).toEqual([field]);
    });

    it('PATCH updates (200), DELETE removes a scoped row (204) and refuses a global one (422)', async () => {
      const { body } = await create(intervalBody).expect(201);
      const path = `/api/admin/intervals/${body.interval.id}`;

      const res = await request(app)
        .patch(path)
        .set('Authorization', ADMIN)
        .send({ km: 9000 })
        .expect(200);
      expect(res.body.interval).toMatchObject({ km: 9000, months: 12 });
      await request(app).delete(path).set('Authorization', ADMIN).expect(204);
      await request(app).patch(path).set('Authorization', ADMIN).send({ km: 9000 }).expect(404);

      const list = await request(app).get('/api/admin/intervals').set('Authorization', ADMIN);
      await request(app)
        .delete(`/api/admin/intervals/${list.body.intervals[0].id}`)
        .set('Authorization', ADMIN)
        .expect(422);
    });
  });

  describe('end to end', () => {
    it('a model-scoped disabled override hides an item for that model only', async () => {
      const tara = await request(app)
        .post('/api/vehicles')
        .set('Authorization', USER)
        .send(vehicleBody('345', 'tara'))
        .expect(201);
      const dena = await request(app)
        .post('/api/vehicles')
        .set('Authorization', USER)
        .send(vehicleBody('346', 'dena-plus'))
        .expect(201);

      await request(app)
        .post('/api/admin/service-items')
        .set('Authorization', ADMIN)
        .send({ ...itemBody, itemId: 'fuel_filter', disabled: true })
        .expect(201);

      const fuelFilter = async (vehicleId?: string) => {
        const res = await request(app)
          .get('/api/service-items')
          .query(vehicleId ? { vehicleId } : {})
          .set('Authorization', USER)
          .expect(200);
        return res.body.categories
          .flatMap((c: { items: { id: string }[] }) => c.items)
          .find((item: { id: string }) => item.id === 'fuel_filter');
      };
      expect(await fuelFilter(tara.body.id)).toMatchObject({ disabled: true });
      expect(await fuelFilter(dena.body.id)).toMatchObject({ disabled: false });
      expect(await fuelFilter()).toMatchObject({ disabled: false });

      const visit = await request(app)
        .post(`/api/vehicles/${tara.body.id}/services`)
        .set('Authorization', USER)
        .send({
          serviceDate: '2026-01-01T08:00:00Z',
          odometerKm: 34500,
          workshop: 'x',
          lineItems: [{ itemId: 'fuel_filter', cost: 1 }],
        })
        .expect(400);
      expect(visit.body.error.details).toEqual({
        lineItems: ['Item is disabled for this vehicle: fuel_filter'],
      });
    });

    it("a model-scoped disabled interval disappears from that vehicle's intervals and due", async () => {
      const tara = await request(app)
        .post('/api/vehicles')
        .set('Authorization', USER)
        .send(vehicleBody('345', 'tara'))
        .expect(201);
      await request(app)
        .post('/api/admin/intervals')
        .set('Authorization', ADMIN)
        .send({ ...intervalBody, disabled: true })
        .expect(201);

      const intervals = await request(app)
        .get(`/api/vehicles/${tara.body.id}/intervals`)
        .set('Authorization', USER)
        .expect(200);
      const due = await request(app)
        .get(`/api/vehicles/${tara.body.id}/due`)
        .set('Authorization', USER)
        .expect(200);

      expect(intervals.body.intervals).toHaveLength(7);
      expect(due.body.items).toHaveLength(7);
      expect(due.body.items.map((i: { intervalId: string }) => i.intervalId)).not.toContain(
        'engine_oil',
      );
    });
  });
});
