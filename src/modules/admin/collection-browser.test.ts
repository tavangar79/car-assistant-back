import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { COLLECTIONS, EXCLUDED_MODELS, findCollection, toDocument } from './collection-browser.ts';

const models = Prisma.dmmf.datamodel.models;
const SENSITIVE = /hash|secret|totp|password|cipher|storageKey/i;

describe('collection registry', () => {
  it('classifies every Prisma model as either registered or excluded', () => {
    const registered = COLLECTIONS.map((entry) => entry.model as string);
    const unclassified = models
      .map((model) => model.name)
      .filter(
        (name) => !registered.includes(name) && !(EXCLUDED_MODELS as string[]).includes(name),
      );

    expect(unclassified).toEqual([]);
  });

  it('never registers an excluded model', () => {
    for (const entry of COLLECTIONS) {
      expect(EXCLUDED_MODELS).not.toContain(entry.model);
    }
  });

  it.each(COLLECTIONS.map((entry) => [entry.name, entry] as const))(
    '%s uses the @@map name and only real, non-Bytes, non-secret fields',
    (_name, entry) => {
      const model = models.find((m) => m.name === entry.model)!;
      const fieldType = new Map(model.fields.map((field) => [field.name, field.type]));

      expect(model.dbName).toBe(entry.name);
      expect(entry.fields[0]).toBe('id');
      for (const field of entry.fields) {
        expect(field).not.toMatch(SENSITIVE);
        expect(fieldType.has(field), `${entry.name}.${field} exists`).toBe(true);
        expect(fieldType.get(field), `${entry.name}.${field} is not Bytes`).not.toBe('Bytes');
      }
    },
  );

  it('has no Prisma model that stores file bytes (they live in FileStorage)', () => {
    const bytesFields = models.flatMap((model) =>
      model.fields.filter((field) => field.type === 'Bytes').map((f) => `${model.name}.${f.name}`),
    );

    expect(bytesFields).toEqual([]);
  });

  it('shows every file model as sizeBytes + contentType, never its storageKey', () => {
    const fileModels = models.filter((m) => m.fields.some((field) => field.name === 'storageKey'));
    expect(fileModels.map((m) => m.name).sort()).toEqual([
      'ExpenseAttachment',
      'ServiceInvoice',
      'UserAvatar',
      'VehicleDocumentFile',
      'VehiclePhoto',
    ]);
    for (const model of fileModels) {
      const entry = COLLECTIONS.find((e) => e.model === model.name)!;
      expect(entry.fields, entry.name).toContain('sizeBytes');
      expect(entry.fields, entry.name).toContain('contentType');
      expect(entry.fields, entry.name).not.toContain('storageKey');
    }
  });

  it('has unique names', () => {
    const names = COLLECTIONS.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('toDocument', () => {
  it('keeps exactly the registered fields, in order, with missing ones as null', () => {
    const entry = findCollection('vehicle_photos')!;

    const document = toDocument(entry, {
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      id: 'p1',
      storageKey: 'vehicle-photos/v1/abc.png',
      sizeBytes: 3,
      contentType: 'image/png',
    });

    expect(Object.keys(document)).toEqual([
      'id',
      'vehicleId',
      'contentType',
      'sizeBytes',
      'updatedAt',
    ]);
    expect(document).toEqual({
      id: 'p1',
      vehicleId: null,
      contentType: 'image/png',
      sizeBytes: 3,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
  });

  it('passes nested objects and arrays through', () => {
    const plate = { twoDigits: '72', letter: 'ب', threeDigits: '345', provinceCode: '68' };

    expect(toDocument(findCollection('vehicles')!, { id: 'v1', plate }).plate).toEqual(plate);
  });
});

describe('findCollection', () => {
  it.each(['admins', 'otp_codes', 'otp_requests', 'nope'])('does not find %s', (name) => {
    expect(findCollection(name)).toBeUndefined();
  });
});
