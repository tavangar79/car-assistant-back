import { describe, expect, it } from 'vitest';
import { VEHICLE_CATALOG } from './vehicle-catalog.data.ts';
import { VehicleCatalog } from './vehicle-catalog.ts';

describe('VEHICLE_CATALOG', () => {
  const makes = VEHICLE_CATALOG;
  const models = makes.flatMap((make) => make.models);
  const trims = models.flatMap((model) => model.trims);

  it.each([
    ['make', makes.map((m) => m.id)],
    ['model', models.map((m) => m.id)],
    ['trim', trims.map((t) => t.id)],
  ])('has unique %s ids', (_kind, ids) => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses lowercase slugs for every id', () => {
    for (const id of [...makes, ...models, ...trims].map((item) => item.id)) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it.each(['iran-khodro', 'saipa', 'bahman', 'mvm-chery', 'kmc-jac', 'toyota', 'hyundai', 'kia'])(
    'includes the %s make',
    (id) => {
      expect(makes.some((make) => make.id === id)).toBe(true);
    },
  );
});

describe('VehicleCatalog', () => {
  const catalog = new VehicleCatalog(VEHICLE_CATALOG);

  describe('check', () => {
    it('accepts a matching make, model and trim', () => {
      expect(
        catalog.check({ makeId: 'iran-khodro', modelId: 'tara', trimId: 'tara-v4-at' }),
      ).toEqual({});
    });

    it('accepts a null trim', () => {
      expect(catalog.check({ makeId: 'saipa', modelId: 'shahin', trimId: null })).toEqual({});
    });

    it('rejects unknown ids', () => {
      expect(catalog.check({ makeId: 'nope', modelId: 'nope', trimId: 'nope' })).toEqual({
        makeId: ['Unknown make'],
        modelId: ['Unknown model'],
        trimId: ['Unknown trim'],
      });
    });

    it('rejects a model from another make', () => {
      expect(catalog.check({ makeId: 'saipa', modelId: 'tara', trimId: null })).toEqual({
        modelId: ['Model does not belong to the make'],
      });
    });

    it('rejects a trim from another model', () => {
      expect(
        catalog.check({ makeId: 'iran-khodro', modelId: 'tara', trimId: 'dena-plus-mt' }),
      ).toEqual({ trimId: ['Trim does not belong to the model'] });
    });
  });

  describe('checkScope', () => {
    const scope = (makeId: string | null, modelId: string | null, trimId: string | null) => ({
      makeId,
      modelId,
      trimId,
    });

    it.each([
      [scope(null, null, null)],
      [scope('iran-khodro', null, null)],
      [scope('iran-khodro', 'tara', null)],
      [scope('iran-khodro', 'tara', 'tara-v4-at')],
    ])('accepts %j', (value) => {
      expect(catalog.checkScope(value)).toEqual([]);
    });

    it.each([
      [scope(null, 'tara', null), 'modelId requires makeId'],
      [scope('iran-khodro', null, 'tara-v4-at'), 'trimId requires modelId'],
      [scope('nope', null, null), 'Unknown make'],
      [scope('iran-khodro', 'nope', null), 'Unknown model'],
      [scope('saipa', 'tara', null), 'Model does not belong to the make'],
      [scope('iran-khodro', 'tara', 'nope'), 'Unknown trim'],
      [scope('iran-khodro', 'tara', 'dena-plus-mt'), 'Trim does not belong to the model'],
    ])('rejects %j', (value, message) => {
      expect(catalog.checkScope(value)).toEqual([message]);
    });
  });

  describe('resolve', () => {
    it('returns the display names', () => {
      expect(
        catalog.resolve({ makeId: 'iran-khodro', modelId: 'tara', trimId: 'tara-v4-at' }),
      ).toEqual({
        make: { id: 'iran-khodro', name: 'ایران خودرو' },
        model: { id: 'tara', name: 'تارا' },
        trim: { id: 'tara-v4-at', name: 'V4 اتوماتیک - فول آپشن' },
      });
    });

    it('falls back to the id for an id no longer in the catalog', () => {
      expect(catalog.resolve({ makeId: 'gone', modelId: 'tara', trimId: null })).toEqual({
        make: { id: 'gone', name: 'gone' },
        model: { id: 'tara', name: 'تارا' },
        trim: null,
      });
    });
  });
});
