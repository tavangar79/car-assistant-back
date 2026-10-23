import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { SEED_SERVICE_ITEMS } from '../../scripts/catalog-seed.data.ts';
import type { InMemoryServiceItemDefRepository } from '../../test/in-memory-service-item-def.repository.ts';
import {
  createTestDependencies,
  seededServiceItemDefs,
  TEST_JWT_SECRET,
} from '../../test/test-dependencies.ts';
import { TokenService } from '../auth/token.service.ts';
import { globalServiceItemRows } from '../service-catalog/catalog-seed.ts';
import { SERVICE_CATEGORIES } from '../service-catalog/catalog.types.ts';
import { toCategories } from './service-items.ts';

const tokens = new TokenService(TEST_JWT_SECRET, '30d');
const ALICE = `Bearer ${tokens.sign('aaaaaaaaaaaaaaaaaaaaaaaa')}`;
const BOB = `Bearer ${tokens.sign('bbbbbbbbbbbbbbbbbbbbbbbb')}`;

const ENGINE_OIL = {
  id: 'engine_oil',
  title: 'روغن موتور',
  subtitle: 'تعویض و فلاش',
  icon: 'oil_barrel',
  disabled: false,
};

const vehicleBody = {
  nickname: 'تارا',
  plate: { twoDigits: '72', letter: 'ب', threeDigits: '345', provinceCode: '68' },
  makeId: 'iran-khodro',
  modelId: 'tara',
  trimId: 'tara-v4-at',
  yearJalali: 1402,
  mileageKm: 34500,
};

const globalItem = (itemId: string) =>
  globalServiceItemRows().find((row) => row.itemId === itemId)!;

type Body = { categories: { id: string; items: { id: string; disabled: boolean }[] }[] };
const itemsOf = (body: Body) => body.categories.flatMap((c) => c.items);
const itemIn = (body: Body, id: string) => itemsOf(body).find((item) => item.id === id);

describe('toCategories', () => {
  it('groups by the static categories in order and omits empty ones', () => {
    const item = (id: string, categoryId: string) => ({ ...ENGINE_OIL, id, categoryId });

    expect(toCategories([item('b', 'brakes'), item('a', 'fluids'), item('c', 'brakes')])).toEqual({
      categories: [
        { id: 'fluids', title: SERVICE_CATEGORIES[0].title, items: [{ ...ENGINE_OIL, id: 'a' }] },
        {
          id: 'brakes',
          title: SERVICE_CATEGORIES[1].title,
          items: [
            { ...ENGINE_OIL, id: 'b' },
            { ...ENGINE_OIL, id: 'c' },
          ],
        },
      ],
    });
  });
});

describe('GET /api/service-items', () => {
  let definitions: InMemoryServiceItemDefRepository;
  let app: ReturnType<typeof createApp>;
  let vehicleId: string;

  beforeEach(async () => {
    definitions = seededServiceItemDefs();
    app = createApp(createTestDependencies({ serviceItemDefRepository: definitions }));
    const res = await request(app)
      .post('/api/vehicles')
      .set('Authorization', ALICE)
      .send(vehicleBody)
      .expect(201);
    vehicleId = res.body.id;
  });

  it('returns 401 without a token', async () => {
    await request(app).get('/api/service-items').expect(401);
  });

  describe('without vehicleId (title lookup)', () => {
    it('returns the seeded catalog in the 6 categories, in order', async () => {
      const res = await request(app)
        .get('/api/service-items')
        .set('Authorization', ALICE)
        .expect(200);

      expect(res.body.categories.map((c: { id: string }) => c.id)).toEqual(
        SERVICE_CATEGORIES.map((c) => c.id),
      );
      expect(itemsOf(res.body).map((item) => item.id)).toEqual(
        SEED_SERVICE_ITEMS.map((item) => item.itemId),
      );
      expect(res.body.categories[0]).toMatchObject({ id: 'fluids', title: 'روغن و مایعات مصرفی' });
      expect(res.body.categories[0].items[0]).toEqual(ENGINE_OIL);
    });

    it('uses the least specific row and includes items that only exist in a scope', async () => {
      await definitions.create({ ...globalItem('engine_oil'), makeId: 'saipa', title: 'سایپا' });
      await definitions.create({
        ...globalItem('engine_oil'),
        itemId: 'cvt_oil',
        makeId: 'saipa',
        modelId: 'quick',
        title: 'روغن CVT',
      });

      const res = await request(app).get('/api/service-items').set('Authorization', ALICE);

      expect(itemIn(res.body, 'engine_oil')).toEqual(ENGINE_OIL);
      expect(itemIn(res.body, 'cvt_oil')).toMatchObject({ title: 'روغن CVT', disabled: false });
    });

    it('reports disabled from that row', async () => {
      const row = (await definitions.listAll()).find((r) => r.itemId === 'battery')!;
      await definitions.update(row.id, { disabled: true });

      const res = await request(app).get('/api/service-items').set('Authorization', ALICE);

      expect(itemIn(res.body, 'battery')?.disabled).toBe(true);
    });
  });

  describe('with vehicleId', () => {
    const get = (id: string, auth = ALICE) =>
      request(app).get('/api/service-items').query({ vehicleId: id }).set('Authorization', auth);

    it('returns the seeded catalog for a vehicle without overrides', async () => {
      const res = await get(vehicleId).expect(200);

      expect(itemsOf(res.body)).toHaveLength(26);
      expect(res.body.categories[0].items[0]).toEqual(ENGINE_OIL);
    });

    it('resolves the most specific row, keeps disabled items and orders by sortOrder', async () => {
      await definitions.create({
        ...globalItem('engine_oil'),
        makeId: 'iran-khodro',
        modelId: 'tara',
        trimId: 'tara-v4-at',
        title: 'روغن موتور تارا',
        sortOrder: 99,
      });
      await definitions.create({ ...globalItem('coolant'), makeId: 'iran-khodro', disabled: true });
      await definitions.create({ ...globalItem('battery'), makeId: 'saipa', disabled: true });

      const res = await get(vehicleId).expect(200);
      const fluids = res.body.categories[0].items.map((item: { id: string }) => item.id);

      expect(itemIn(res.body, 'engine_oil')).toMatchObject({ title: 'روغن موتور تارا' });
      expect(fluids.at(-1)).toBe('engine_oil');
      expect(itemIn(res.body, 'coolant')?.disabled).toBe(true);
      expect(itemIn(res.body, 'battery')?.disabled).toBe(false);
    });

    it('omits a category with no resolved items', async () => {
      for (const row of await definitions.listAll()) {
        if (row.categoryId === 'drivetrain') await definitions.delete(row.id);
      }

      const res = await get(vehicleId).expect(200);

      expect(res.body.categories.map((c: { id: string }) => c.id)).not.toContain('drivetrain');
    });

    it("returns 404 for another user's vehicle or a malformed id", async () => {
      await get(vehicleId, BOB).expect(404);
      await get('nope').expect(404);
    });
  });
});
