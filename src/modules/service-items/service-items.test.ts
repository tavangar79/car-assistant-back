import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { createTestDependencies, TEST_JWT_SECRET } from '../../test/test-dependencies.ts';
import { TokenService } from '../auth/token.service.ts';
import { SERVICE_ITEMS } from './service-items.data.ts';
import { ServiceItemCatalog } from './service-items.ts';

const EXPECTED = {
  fluids: [
    'engine_oil',
    'oil_filter',
    'air_filter',
    'cabin_filter',
    'coolant',
    'brake_fluid',
    'fuel_filter',
  ],
  brakes: ['front_brake_pads', 'rear_brake_pads', 'brake_disc_skim', 'brake_booster_hoses'],
  suspension: ['wheel_alignment', 'ball_joints_bushings', 'shock_absorbers', 'wheel_balancing'],
  electrical: ['battery', 'spark_plugs', 'alternator_starter', 'lights_fuses'],
  drivetrain: ['gearbox_oil', 'clutch_kit', 'cv_boots'],
  periodic: ['timing_belt_kit', 'drive_belt', 'injector_cleaning', 'full_torque_check'],
};

describe('SERVICE_ITEMS', () => {
  const items = SERVICE_ITEMS.flatMap((category) => category.items);

  it('has the 6 categories with the item ids from DOMAIN.md, in order', () => {
    expect(
      Object.fromEntries(SERVICE_ITEMS.map((c) => [c.id, c.items.map((item) => item.id)])),
    ).toEqual(EXPECTED);
  });

  it('has the 25 step-1 items plus fuel_filter, with unique ids', () => {
    expect(items).toHaveLength(26);
    expect(new Set(items.map((item) => item.id)).size).toBe(26);
  });

  it('gives every item a title, subtitle and icon', () => {
    for (const item of items) {
      expect(item.title).not.toBe('');
      expect(item.subtitle).not.toBe('');
      expect(item.icon).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it('describes fuel_filter as specified', () => {
    expect(items.find((item) => item.id === 'fuel_filter')).toEqual({
      id: 'fuel_filter',
      title: 'تعویض فیلتر بنزین',
      subtitle: 'صافی سوخت و خطوط سوخت‌رسانی',
      icon: 'local_gas_station',
    });
  });
});

describe('ServiceItemCatalog', () => {
  const catalog = new ServiceItemCatalog(SERVICE_ITEMS);

  it('finds an item by id', () => {
    expect(catalog.has('engine_oil')).toBe(true);
    expect(catalog.get('engine_oil')).toEqual({
      id: 'engine_oil',
      title: 'روغن موتور',
      subtitle: 'تعویض و فلاش',
      icon: 'oil_barrel',
    });
  });

  it('does not find an unknown id', () => {
    expect(catalog.has('nope')).toBe(false);
    expect(catalog.get('nope')).toBeUndefined();
  });
});

describe('GET /api/service-items', () => {
  const app = createApp(createTestDependencies());
  const token = `Bearer ${new TokenService(TEST_JWT_SECRET, '30d').sign('aaaaaaaaaaaaaaaaaaaaaaaa')}`;

  it('returns 401 without a token', async () => {
    await request(app).get('/api/service-items').expect(401);
  });

  it('returns the catalog', async () => {
    const res = await request(app)
      .get('/api/service-items')
      .set('Authorization', token)
      .expect(200);

    expect(res.body).toEqual({ categories: SERVICE_ITEMS });
    expect(res.body.categories[0].items[0]).toEqual({
      id: 'engine_oil',
      title: 'روغن موتور',
      subtitle: 'تعویض و فلاش',
      icon: 'oil_barrel',
    });
  });
});
