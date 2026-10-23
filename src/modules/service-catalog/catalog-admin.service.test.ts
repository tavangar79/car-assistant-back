import { beforeEach, describe, expect, it } from 'vitest';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../shared/errors.ts';
import type { InMemoryIntervalDefRepository } from '../../test/in-memory-interval-def.repository.ts';
import type { InMemoryServiceItemDefRepository } from '../../test/in-memory-service-item-def.repository.ts';
import { seededIntervalDefs, seededServiceItemDefs } from '../../test/test-dependencies.ts';
import { VEHICLE_CATALOG } from '../vehicle-catalog/vehicle-catalog.data.ts';
import { VehicleCatalog } from '../vehicle-catalog/vehicle-catalog.ts';
import { CatalogAdminService, GLOBAL_DELETE } from './catalog-admin.service.ts';
import type { CreateIntervalDefInput, CreateServiceItemDefInput } from './catalog.types.ts';

const GLOBAL = { makeId: null, modelId: null, trimId: null };
const TARA = { makeId: 'iran-khodro', modelId: 'tara', trimId: null };
const MISSING_ID = 'cccccccccccccccccccccccc';

const itemInput = (
  overrides: Partial<CreateServiceItemDefInput> = {},
): CreateServiceItemDefInput => ({
  itemId: 'engine_oil',
  scope: TARA,
  categoryId: 'fluids',
  title: 'روغن موتور تارا',
  subtitle: 'زیرعنوان',
  icon: 'oil_barrel',
  sortOrder: 0,
  disabled: false,
  ...overrides,
});

const intervalInput = (
  overrides: Partial<CreateIntervalDefInput> = {},
): CreateIntervalDefInput => ({
  intervalId: 'engine_oil',
  scope: TARA,
  title: 'روغن موتور',
  description: 'توضیح',
  icon: 'oil_barrel',
  coversItemIds: ['engine_oil'],
  km: 8000,
  months: 12,
  sortOrder: 0,
  disabled: false,
  ...overrides,
});

async function caught(promise: Promise<unknown>): Promise<AppError> {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  return err as AppError;
}

describe('CatalogAdminService', () => {
  let items: InMemoryServiceItemDefRepository;
  let intervals: InMemoryIntervalDefRepository;
  let service: CatalogAdminService;

  beforeEach(() => {
    items = seededServiceItemDefs();
    intervals = seededIntervalDefs();
    service = new CatalogAdminService({
      items,
      intervals,
      vehicleCatalog: new VehicleCatalog(VEHICLE_CATALOG),
    });
  });

  const globalItemId = async (itemId: string) =>
    (await items.listAll()).find((r) => r.itemId === itemId && r.makeId === null)!.id;
  const globalIntervalId = async (intervalId: string) =>
    (await intervals.listAll()).find((r) => r.intervalId === intervalId && r.makeId === null)!.id;

  describe('items', () => {
    it('lists every row ordered by itemId, then specificity, with the scope nested', async () => {
      await service.createItem(itemInput());
      await service.createItem(itemInput({ scope: { ...GLOBAL, makeId: 'iran-khodro' } }));

      const rows = await service.listItems();

      expect(rows).toHaveLength(28);
      expect(rows[0]!.itemId).toBe('air_filter');
      const engineOil = rows.filter((r) => r.itemId === 'engine_oil');
      expect(engineOil.map((r) => r.scope)).toEqual([
        GLOBAL,
        { ...GLOBAL, makeId: 'iran-khodro' },
        TARA,
      ]);
      expect(engineOil[0]).not.toHaveProperty('makeId');
    });

    it('creates a scoped row', async () => {
      const row = await service.createItem(itemInput());

      expect(row).toMatchObject({ itemId: 'engine_oil', scope: TARA, title: 'روغن موتور تارا' });
      expect(await items.findById(row.id)).toMatchObject({
        makeId: 'iran-khodro',
        modelId: 'tara',
      });
    });

    it('rejects the same itemId and scope with 409', async () => {
      await service.createItem(itemInput());

      await expect(service.createItem(itemInput())).rejects.toBeInstanceOf(ConflictError);
      await expect(service.createItem(itemInput({ scope: GLOBAL }))).rejects.toBeInstanceOf(
        ConflictError,
      );
    });

    it('rejects a scope that does not fit the vehicle catalog', async () => {
      const err = await caught(
        service.createItem(
          itemInput({ scope: { makeId: 'saipa', modelId: 'tara', trimId: null } }),
        ),
      );

      expect(err).toBeInstanceOf(ValidationError);
      expect(err.details).toEqual({ scope: ['Model does not belong to the make'] });
    });

    it('updates the editable fields', async () => {
      const id = await globalItemId('battery');

      const row = await service.updateItem(id, { title: 'باتری', disabled: true });

      expect(row).toMatchObject({ id, itemId: 'battery', title: 'باتری', disabled: true });
    });

    it('returns 404 when updating or deleting a missing or malformed id', async () => {
      await expect(service.updateItem(MISSING_ID, { title: 'x' })).rejects.toBeInstanceOf(
        NotFoundError,
      );
      await expect(service.deleteItem('nope')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('deletes a scoped row but not a global one (422)', async () => {
      const scoped = await service.createItem(itemInput());

      await service.deleteItem(scoped.id);
      expect(await items.findById(scoped.id)).toBeNull();

      const err = await caught(service.deleteItem(await globalItemId('engine_oil')));
      expect(err.statusCode).toBe(422);
      expect(err.message).toBe(GLOBAL_DELETE);
    });
  });

  describe('intervals', () => {
    it('lists every row ordered by intervalId, then specificity', async () => {
      await service.createInterval(intervalInput());

      const rows = await service.listIntervals();

      expect(rows).toHaveLength(9);
      expect(rows[0]!.intervalId).toBe('air_filter');
      expect(rows.filter((r) => r.intervalId === 'engine_oil').map((r) => r.scope)).toEqual([
        GLOBAL,
        TARA,
      ]);
    });

    it('creates a scoped row and rejects a duplicate', async () => {
      const row = await service.createInterval(intervalInput());

      expect(row).toMatchObject({ intervalId: 'engine_oil', scope: TARA, km: 8000, months: 12 });
      await expect(service.createInterval(intervalInput())).rejects.toBeInstanceOf(ConflictError);
    });

    it('accepts covered items that exist only in a scoped row', async () => {
      await service.createItem(itemInput({ itemId: 'cvt_oil' }));

      await expect(
        service.createInterval(intervalInput({ intervalId: 'cvt', coversItemIds: ['cvt_oil'] })),
      ).resolves.toMatchObject({ coversItemIds: ['cvt_oil'] });
    });

    it('rejects unknown covered items on create and update', async () => {
      const created = await caught(
        service.createInterval(intervalInput({ coversItemIds: ['engine_oil', 'nope'] })),
      );
      expect(created.details).toEqual({ coversItemIds: ['Unknown item: nope'] });

      const updated = await caught(
        service.updateInterval(await globalIntervalId('coolant'), { coversItemIds: ['nope'] }),
      );
      expect(updated.details).toEqual({ coversItemIds: ['Unknown item: nope'] });
    });

    it('rejects a trim without a model', async () => {
      const err = await caught(
        service.createInterval(
          intervalInput({ scope: { makeId: 'iran-khodro', modelId: null, trimId: 'tara-v4-at' } }),
        ),
      );

      expect(err.details).toEqual({ scope: ['trimId requires modelId'] });
    });

    it('updates the editable fields', async () => {
      const id = await globalIntervalId('coolant');

      const row = await service.updateInterval(id, { km: 45000, months: 30 });

      expect(row).toMatchObject({ id, intervalId: 'coolant', km: 45000, months: 30 });
    });

    it('deletes a scoped row but not a global one (422), and 404s a missing one', async () => {
      const scoped = await service.createInterval(intervalInput());

      await service.deleteInterval(scoped.id);
      expect(await intervals.findById(scoped.id)).toBeNull();

      expect(
        (await caught(service.deleteInterval(await globalIntervalId('coolant')))).statusCode,
      ).toBe(422);
      await expect(service.deleteInterval(MISSING_ID)).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.updateInterval('nope', { km: 1000 })).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });
});
