import { describe, expect, it } from 'vitest';
import {
  resolveForVehicle,
  resolveLeastSpecific,
  specificity,
  type ScopedRow,
} from './resolve-for-vehicle.ts';

interface Row extends ScopedRow {
  key: string;
  label: string;
}

const row = (key: string, label: string, scope: Partial<Row> = {}): Row => ({
  key,
  label,
  makeId: null,
  modelId: null,
  trimId: null,
  sortOrder: 0,
  disabled: false,
  ...scope,
});

const TARA_V4 = { makeId: 'iran-khodro', modelId: 'tara', trimId: 'tara-v4-at' };
const keyOf = (r: Row) => r.key;
const labels = (rows: Row[]) => rows.map((r) => `${r.key}:${r.label}`);

describe('specificity', () => {
  it('ranks trim 3 > model 2 > make 1 > global 0', () => {
    expect(specificity(row('a', 'g'))).toBe(0);
    expect(specificity(row('a', 'm', { makeId: 'x' }))).toBe(1);
    expect(specificity(row('a', 'm', { makeId: 'x', modelId: 'y' }))).toBe(2);
    expect(specificity(row('a', 't', { makeId: 'x', modelId: 'y', trimId: 'z' }))).toBe(3);
  });
});

describe('resolveForVehicle', () => {
  it('returns global rows when there is nothing more specific', () => {
    expect(labels(resolveForVehicle([row('oil', 'global')], TARA_V4, keyOf))).toEqual([
      'oil:global',
    ]);
  });

  it('lets a make row beat the global row', () => {
    const rows = [row('oil', 'global'), row('oil', 'make', { makeId: 'iran-khodro' })];
    expect(labels(resolveForVehicle(rows, TARA_V4, keyOf))).toEqual(['oil:make']);
  });

  it('lets a model row beat the make row', () => {
    const rows = [
      row('oil', 'model', { makeId: 'iran-khodro', modelId: 'tara' }),
      row('oil', 'make', { makeId: 'iran-khodro' }),
      row('oil', 'global'),
    ];
    expect(labels(resolveForVehicle(rows, TARA_V4, keyOf))).toEqual(['oil:model']);
  });

  it('lets a trim row beat the model row', () => {
    const rows = [
      row('oil', 'model', { makeId: 'iran-khodro', modelId: 'tara' }),
      row('oil', 'trim', TARA_V4),
    ];
    expect(labels(resolveForVehicle(rows, TARA_V4, keyOf))).toEqual(['oil:trim']);
  });

  it('ignores scoped rows that do not match the vehicle', () => {
    const rows = [
      row('oil', 'global'),
      row('oil', 'other make', { makeId: 'saipa' }),
      row('oil', 'other model', { makeId: 'iran-khodro', modelId: 'dena-plus' }),
      row('oil', 'other trim', { ...TARA_V4, trimId: 'tara-v1-mt' }),
      row('cng', 'only saipa', { makeId: 'saipa' }),
    ];
    expect(labels(resolveForVehicle(rows, TARA_V4, keyOf))).toEqual(['oil:global']);
  });

  it('does not match a trim row for a vehicle without a trim', () => {
    const rows = [row('oil', 'global'), row('oil', 'trim', TARA_V4)];
    const noTrim = { ...TARA_V4, trimId: null };
    expect(labels(resolveForVehicle(rows, noTrim, keyOf))).toEqual(['oil:global']);
  });

  it('keeps a disabled override as the picked row, so the item is hidden for that vehicle', () => {
    const rows = [
      row('oil', 'global'),
      row('oil', 'off', { makeId: 'iran-khodro', modelId: 'tara', disabled: true }),
    ];
    const resolved = resolveForVehicle(rows, TARA_V4, keyOf);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ label: 'off', disabled: true });
    expect(resolved.filter((r) => !r.disabled)).toEqual([]);
  });

  it('orders by sortOrder, then key', () => {
    const rows = [
      row('c', 'x', { sortOrder: 2 }),
      row('b', 'x', { sortOrder: 1 }),
      row('a', 'x', { sortOrder: 2 }),
    ];
    expect(resolveForVehicle(rows, TARA_V4, keyOf).map(keyOf)).toEqual(['b', 'a', 'c']);
  });

  it('uses the sortOrder of the picked row', () => {
    const rows = [
      row('a', 'global', { sortOrder: 1 }),
      row('b', 'global', { sortOrder: 2 }),
      row('a', 'model', { makeId: 'iran-khodro', modelId: 'tara', sortOrder: 3 }),
    ];
    expect(resolveForVehicle(rows, TARA_V4, keyOf).map(keyOf)).toEqual(['b', 'a']);
  });
});

describe('resolveLeastSpecific', () => {
  it('picks the global row when it exists, else the least specific one', () => {
    const rows = [
      row('oil', 'model', { makeId: 'iran-khodro', modelId: 'tara' }),
      row('oil', 'global'),
      row('cng', 'trim', TARA_V4),
      row('cng', 'make', { makeId: 'saipa' }),
    ];
    expect(labels(resolveLeastSpecific(rows, keyOf))).toEqual(['cng:make', 'oil:global']);
  });
});
