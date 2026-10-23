import { describe, expect, it } from 'vitest';
import { SEED_INTERVALS, SEED_SERVICE_ITEMS } from '../../scripts/catalog-seed.data.ts';
import { InMemoryIntervalDefRepository } from '../../test/in-memory-interval-def.repository.ts';
import { InMemoryServiceItemDefRepository } from '../../test/in-memory-service-item-def.repository.ts';
import {
  globalIntervalRows,
  globalServiceItemRows,
  seedEmptyCatalog,
  seedIntervals,
  seedServiceItems,
} from './catalog-seed.ts';
import { SERVICE_CATEGORIES } from './catalog.types.ts';

const EXPECTED_ITEMS = {
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

describe('catalog seed data', () => {
  it('has the item ids from DOMAIN.md per category, in order', () => {
    const byCategory = Object.fromEntries(
      SERVICE_CATEGORIES.map((c) => [
        c.id,
        SEED_SERVICE_ITEMS.filter((item) => item.categoryId === c.id).map((item) => item.itemId),
      ]),
    );
    expect(byCategory).toEqual(EXPECTED_ITEMS);
  });

  it('has 26 items with unique ids, each with a title, subtitle and icon', () => {
    expect(SEED_SERVICE_ITEMS).toHaveLength(26);
    expect(new Set(SEED_SERVICE_ITEMS.map((item) => item.itemId)).size).toBe(26);
    for (const item of SEED_SERVICE_ITEMS) {
      expect(item.title).not.toBe('');
      expect(item.subtitle).not.toBe('');
      expect(item.icon).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it('has 8 intervals that only cover known items', () => {
    const itemIds = new Set(SEED_SERVICE_ITEMS.map((item) => item.itemId));
    expect(SEED_INTERVALS.map((i) => i.intervalId)).toEqual([
      'engine_oil',
      'air_filter',
      'fuel_filter',
      'front_brake_pads',
      'spark_plugs',
      'gearbox_oil',
      'timing_belt_kit',
      'coolant',
    ]);
    for (const interval of SEED_INTERVALS) {
      expect(interval.coversItemIds.every((id) => itemIds.has(id))).toBe(true);
    }
  });

  it('turns the seed into global, enabled rows ordered by position', () => {
    expect(globalServiceItemRows()[1]).toEqual({
      itemId: 'oil_filter',
      categoryId: 'fluids',
      title: 'فیلتر روغن',
      subtitle: 'همراه با تعویض روغن',
      icon: 'filter_alt',
      makeId: null,
      modelId: null,
      trimId: null,
      sortOrder: 1,
      disabled: false,
    });
    expect(globalIntervalRows()[0]).toMatchObject({
      intervalId: 'engine_oil',
      km: 5000,
      months: 6,
      sortOrder: 0,
      makeId: null,
      disabled: false,
    });
  });
});

describe('seedServiceItems / seedIntervals', () => {
  it('creates every global row in an empty collection', async () => {
    const items = new InMemoryServiceItemDefRepository();
    const intervals = new InMemoryIntervalDefRepository();

    expect(await seedServiceItems(items)).toBe(26);
    expect(await seedIntervals(intervals)).toBe(8);
    expect(await items.listAll()).toHaveLength(26);
    expect(await intervals.listAll()).toHaveLength(8);
  });

  it('only adds missing global rows and never overwrites an edited one', async () => {
    const [edited, ...rest] = globalServiceItemRows();
    const items = new InMemoryServiceItemDefRepository([
      { ...edited!, title: 'ویرایش', disabled: true },
      // A scoped row does not count as the global row.
      { ...rest[0]!, makeId: 'saipa' },
    ]);

    expect(await seedServiceItems(items)).toBe(25);
    const all = await items.listAll();
    expect(all).toHaveLength(27);
    expect(all.find((r) => r.itemId === 'engine_oil')).toMatchObject({
      title: 'ویرایش',
      disabled: true,
    });
    expect(await seedServiceItems(items)).toBe(0);
  });

  it('keeps an edited interval', async () => {
    const intervals = new InMemoryIntervalDefRepository([
      { ...globalIntervalRows()[0]!, km: 7000 },
    ]);

    expect(await seedIntervals(intervals)).toBe(7);
    expect((await intervals.listAll()).find((r) => r.intervalId === 'engine_oil')?.km).toBe(7000);
  });
});

describe('seedEmptyCatalog', () => {
  it('seeds empty collections', async () => {
    const items = new InMemoryServiceItemDefRepository();
    const intervals = new InMemoryIntervalDefRepository();

    await seedEmptyCatalog(items, intervals);

    expect(await items.listAll()).toHaveLength(26);
    expect(await intervals.listAll()).toHaveLength(8);
  });

  it('leaves a collection that already has rows alone', async () => {
    const items = new InMemoryServiceItemDefRepository([globalServiceItemRows()[0]!]);
    const intervals = new InMemoryIntervalDefRepository([globalIntervalRows()[0]!]);

    await seedEmptyCatalog(items, intervals);

    expect(await items.listAll()).toHaveLength(1);
    expect(await intervals.listAll()).toHaveLength(1);
  });
});
