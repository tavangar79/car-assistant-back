import { beforeEach, describe, expect, it } from 'vitest';
import { AppError, NotFoundError, ValidationError } from '../../shared/errors.ts';
import { createGarage, type Garage } from '../../test/garage-fixture.ts';
import { JPEG_BYTES, PDF_BYTES, PNG_BYTES, WEBP_BYTES } from '../../test/image-fixtures.ts';
import { TEST_ENCRYPTION_KEY } from '../../test/test-dependencies.ts';
import {
  DOCUMENT_FILE_BAD_TYPE,
  DOCUMENT_TOO_MANY_FILES,
  DocumentService,
  EXPIRES_AFTER_ISSUED,
} from './document.service.ts';
import type { CreateDocumentInput } from './document.types.ts';

const ALICE = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BOB = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const NOW = new Date('2026-10-17T10:00:00Z');
const UNKNOWN_ID = '0'.repeat(24);

function documentInput(overrides: Partial<CreateDocumentInput> = {}): CreateDocumentInput {
  return {
    type: 'third_party_insurance',
    issuer: 'بیمه ایران',
    number: '124/987432',
    issuedAt: '2026-01-01T00:00:00Z',
    expiresAt: '2026-12-31T00:00:00Z',
    ...overrides,
  };
}

async function validationDetails(promise: Promise<unknown>): Promise<unknown> {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ValidationError);
  return (err as ValidationError).details;
}

describe('DocumentService', () => {
  let garage: Garage;
  let service: DocumentService;
  let vehicleId: string;

  beforeEach(async () => {
    garage = createGarage(NOW);
    service = new DocumentService({
      documents: garage.repositories.documentRepository,
      files: garage.repositories.documentFileRepository,
      notifications: garage.repositories.notificationRepository,
      vehicles: garage.vehicleService,
      encryptionKey: TEST_ENCRYPTION_KEY,
    });
    vehicleId = await garage.addVehicle(ALICE);
  });

  const storedFiles = () => [...garage.repositories.documentFileRepository.files.values()];

  describe('create', () => {
    it('saves the document with nulls for absent optionals, reminder on, and no files', async () => {
      const document = await service.create(ALICE, vehicleId, { type: 'green_sheet' });

      expect(document).toEqual({
        id: expect.stringMatching(/^[a-f\d]{24}$/),
        vehicleId,
        type: 'green_sheet',
        title: null,
        issuer: null,
        number: null,
        issuedAt: null,
        expiresAt: null,
        expiryReminder: true,
        notes: null,
        files: [],
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it('keeps the given fields', async () => {
      const document = await service.create(
        ALICE,
        vehicleId,
        documentInput({ title: 'بیمه‌نامه', notes: 'یادداشت', expiryReminder: false }),
      );

      expect(document).toMatchObject({
        title: 'بیمه‌نامه',
        issuer: 'بیمه ایران',
        number: '124/987432',
        issuedAt: new Date('2026-01-01T00:00:00Z'),
        expiresAt: new Date('2026-12-31T00:00:00Z'),
        expiryReminder: false,
        notes: 'یادداشت',
      });
    });

    it.each([
      ['equal to', '2026-01-01T00:00:00Z'],
      ['before', '2025-12-31T00:00:00Z'],
    ])('rejects an expiresAt %s issuedAt', async (_name, expiresAt) => {
      expect(
        await validationDetails(service.create(ALICE, vehicleId, documentInput({ expiresAt }))),
      ).toEqual({ expiresAt: [EXPIRES_AFTER_ISSUED] });
    });

    it('accepts an expiry without an issue date and vice versa', async () => {
      await expect(
        service.create(ALICE, vehicleId, documentInput({ issuedAt: null })),
      ).resolves.toBeDefined();
      await expect(
        service.create(ALICE, vehicleId, documentInput({ expiresAt: null })),
      ).resolves.toBeDefined();
    });

    it("returns 404 for another user's vehicle", async () => {
      await expect(service.create(BOB, vehicleId, documentInput())).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('list', () => {
    it('orders expiring soonest first, permanent ones last, then newest first', async () => {
      const create = async (expiresAt: string | null) =>
        (await service.create(ALICE, vehicleId, documentInput({ issuedAt: null, expiresAt }))).id;
      const permanentOld = await create(null);
      const late = await create('2027-06-01T00:00:00Z');
      const soon = await create('2026-11-01T00:00:00Z');
      const permanentNew = await create(null);
      const lateNewer = await create('2027-06-01T00:00:00Z');

      const ids = (await service.list(ALICE, vehicleId)).map((d) => d.id);

      expect(ids).toEqual([soon, lateNewer, late, permanentNew, permanentOld]);
    });

    it('carries each document its own files', async () => {
      const withFile = (await service.create(ALICE, vehicleId, documentInput())).id;
      const withoutFile = (await service.create(ALICE, vehicleId, documentInput())).id;
      await service.addFile(ALICE, vehicleId, withFile, { fileName: 'a.pdf', data: PDF_BYTES });

      const list = await service.list(ALICE, vehicleId);

      expect(list.find((d) => d.id === withFile)!.files).toHaveLength(1);
      expect(list.find((d) => d.id === withoutFile)!.files).toEqual([]);
    });

    it('only returns documents of that vehicle', async () => {
      const other = await garage.addVehicle(ALICE, '222');
      await service.create(ALICE, other, documentInput());

      expect(await service.list(ALICE, vehicleId)).toEqual([]);
    });

    it("returns 404 for another user's vehicle", async () => {
      await expect(service.list(BOB, vehicleId)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('getById', () => {
    it('returns the document', async () => {
      const created = await service.create(ALICE, vehicleId, documentInput());

      expect(await service.getById(ALICE, vehicleId, created.id)).toEqual(created);
    });

    it.each([
      ['a malformed id', 'nope'],
      ['an unknown id', UNKNOWN_ID],
    ])('returns 404 for %s', async (_name, id) => {
      await expect(service.getById(ALICE, vehicleId, id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("returns 404 for another vehicle's document", async () => {
      const other = await garage.addVehicle(ALICE, '222');
      const created = await service.create(ALICE, other, documentInput());

      await expect(service.getById(ALICE, vehicleId, created.id)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it("returns 404 for another user's vehicle", async () => {
      const created = await service.create(ALICE, vehicleId, documentInput());

      await expect(service.getById(BOB, vehicleId, created.id)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('update', () => {
    it('changes only the given fields, clears null ones, and keeps the files', async () => {
      const created = await service.create(ALICE, vehicleId, documentInput({ title: 'قدیمی' }));
      await service.addFile(ALICE, vehicleId, created.id, { fileName: 'a.pdf', data: PDF_BYTES });

      const updated = await service.update(ALICE, vehicleId, created.id, {
        title: null,
        number: '999',
        expiresAt: null,
      });

      expect(updated).toMatchObject({
        id: created.id,
        type: 'third_party_insurance',
        title: null,
        issuer: 'بیمه ایران',
        number: '999',
        expiresAt: null,
        files: [expect.objectContaining({ fileName: 'a.pdf' })],
      });
    });

    it('checks expiresAt against the merged record when only issuedAt changes', async () => {
      const created = await service.create(ALICE, vehicleId, documentInput());

      expect(
        await validationDetails(
          service.update(ALICE, vehicleId, created.id, { issuedAt: '2027-01-01T00:00:00Z' }),
        ),
      ).toEqual({ expiresAt: [EXPIRES_AFTER_ISSUED] });
    });

    it('checks expiresAt against the merged record when only expiresAt changes', async () => {
      const created = await service.create(ALICE, vehicleId, documentInput());

      expect(
        await validationDetails(
          service.update(ALICE, vehicleId, created.id, { expiresAt: '2025-01-01T00:00:00Z' }),
        ),
      ).toEqual({ expiresAt: [EXPIRES_AFTER_ISSUED] });
    });

    it('allows any expiry once issuedAt is cleared', async () => {
      const created = await service.create(ALICE, vehicleId, documentInput());

      const updated = await service.update(ALICE, vehicleId, created.id, {
        issuedAt: null,
        expiresAt: '2025-01-01T00:00:00Z',
      });

      expect(updated.issuedAt).toBeNull();
    });

    it("returns 404 for another user's vehicle", async () => {
      const created = await service.create(ALICE, vehicleId, documentInput());

      await expect(
        service.update(BOB, vehicleId, created.id, { number: '1' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('remove', () => {
    it('deletes the document, its files and its notifications only', async () => {
      const removed = await service.create(ALICE, vehicleId, documentInput());
      const kept = await service.create(ALICE, vehicleId, documentInput());
      await service.addFile(ALICE, vehicleId, removed.id, { fileName: 'a.pdf', data: PDF_BYTES });
      const keptWithFile = await service.addFile(ALICE, vehicleId, kept.id, {
        fileName: 'b.pdf',
        data: PDF_BYTES,
      });
      const notificationOf = (refId: string) => ({
        userId: ALICE,
        key: `document:${refId}`,
        kind: 'document_expiry' as const,
        vehicleId,
        refId,
        subject: 'بیمه شخص ثالث',
        dueKm: null,
        remainingKm: null,
        mileageKm: null,
        expiresAt: NOW,
        thresholdDays: 7,
        createdAt: NOW,
      });
      const notifications = garage.repositories.notificationRepository;
      await notifications.createMany([notificationOf(removed.id), notificationOf(kept.id)]);

      await service.remove(ALICE, vehicleId, removed.id);

      expect([...garage.repositories.documentRepository.documents.keys()]).toEqual([kept.id]);
      expect(storedFiles().map((f) => f.id)).toEqual(keptWithFile.files.map((f) => f.id));
      expect([...notifications.notifications.values()].map((n) => n.refId)).toEqual([kept.id]);
    });

    it('returns 404 for an unknown id', async () => {
      await expect(service.remove(ALICE, vehicleId, UNKNOWN_ID)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('files', () => {
    let documentId: string;

    beforeEach(async () => {
      documentId = (await service.create(ALICE, vehicleId, documentInput())).id;
    });

    it.each([
      ['PDF', PDF_BYTES, 'application/pdf'],
      ['JPEG', JPEG_BYTES, 'image/jpeg'],
      ['PNG', PNG_BYTES, 'image/png'],
    ])('addFile stores a %s and returns the document with it', async (_name, data, contentType) => {
      const document = await service.addFile(ALICE, vehicleId, documentId, {
        fileName: 'بیمه‌نامه.pdf',
        data,
      });

      expect(document.files).toEqual([
        {
          id: expect.stringMatching(/^[a-f\d]{24}$/),
          fileName: 'بیمه‌نامه.pdf',
          contentType,
          sizeBytes: data.length,
          createdAt: expect.any(Date),
          url: `/api/vehicles/${vehicleId}/documents/${documentId}/files/${document.files[0]!.id}`,
        },
      ]);
    });

    it('stores the bytes encrypted and getFile decrypts them', async () => {
      const document = await service.addFile(ALICE, vehicleId, documentId, {
        fileName: 'a.pdf',
        data: PDF_BYTES,
      });

      const [stored] = storedFiles();
      expect(Buffer.from(stored!.data).includes(PDF_BYTES)).toBe(false);
      expect(stored!.data.byteLength).toBe(12 + 16 + PDF_BYTES.length);
      expect(await service.getFile(ALICE, vehicleId, documentId, document.files[0]!.id)).toEqual({
        fileName: 'a.pdf',
        contentType: 'application/pdf',
        data: PDF_BYTES,
      });
    });

    it('lists files oldest first', async () => {
      await service.addFile(ALICE, vehicleId, documentId, { fileName: 'front', data: JPEG_BYTES });
      const document = await service.addFile(ALICE, vehicleId, documentId, {
        fileName: 'back',
        data: JPEG_BYTES,
      });

      expect(document.files.map((f) => f.fileName)).toEqual(['front', 'back']);
    });

    it.each([
      ['plain text', Buffer.from('nope')],
      ['WebP', WEBP_BYTES],
    ])('addFile rejects %s', async (_name, data) => {
      expect(
        await validationDetails(
          service.addFile(ALICE, vehicleId, documentId, { fileName: 'x', data }),
        ),
      ).toEqual({ file: [DOCUMENT_FILE_BAD_TYPE] });
    });

    it('rejects a 5th file with 422', async () => {
      for (let i = 0; i < 4; i++) {
        await service.addFile(ALICE, vehicleId, documentId, { fileName: `${i}`, data: PNG_BYTES });
      }

      const err = await service
        .addFile(ALICE, vehicleId, documentId, { fileName: '5', data: PNG_BYTES })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AppError);
      expect(err).toMatchObject({
        statusCode: 422,
        details: { file: [DOCUMENT_TOO_MANY_FILES] },
      });
      expect(storedFiles()).toHaveLength(4);
    });

    it('deleteFile removes it and returns the document', async () => {
      const document = await service.addFile(ALICE, vehicleId, documentId, {
        fileName: 'a',
        data: PDF_BYTES,
      });

      const updated = await service.deleteFile(ALICE, vehicleId, documentId, document.files[0]!.id);

      expect(updated).toMatchObject({ id: documentId, files: [] });
      expect(storedFiles()).toEqual([]);
    });

    it.each([
      ['a malformed id', 'nope'],
      ['an unknown id', UNKNOWN_ID],
    ])('getFile and deleteFile return 404 for %s', async (_name, fileId) => {
      await expect(service.getFile(ALICE, vehicleId, documentId, fileId)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      await expect(service.deleteFile(ALICE, vehicleId, documentId, fileId)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it("returns 404 for another document's file", async () => {
      const other = (await service.create(ALICE, vehicleId, documentInput())).id;
      const document = await service.addFile(ALICE, vehicleId, other, {
        fileName: 'a',
        data: PDF_BYTES,
      });

      await expect(
        service.getFile(ALICE, vehicleId, documentId, document.files[0]!.id),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("returns 404 for another user's vehicle", async () => {
      await expect(
        service.addFile(BOB, vehicleId, documentId, { fileName: 'a', data: PDF_BYTES }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
