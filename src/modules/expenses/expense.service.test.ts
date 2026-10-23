import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '../../shared/errors.ts';
import { JPEG_BYTES, PDF_BYTES, PNG_BYTES, WEBP_BYTES } from '../../test/image-fixtures.ts';
import { InMemoryDocumentFileRepository } from '../../test/in-memory-document-file.repository.ts';
import { InMemoryDocumentRepository } from '../../test/in-memory-document.repository.ts';
import { InMemoryExpenseAttachmentRepository } from '../../test/in-memory-expense-attachment.repository.ts';
import { InMemoryExpenseRepository } from '../../test/in-memory-expense.repository.ts';
import { InMemoryFuelLogRepository } from '../../test/in-memory-fuel-log.repository.ts';
import { InMemoryNotificationRepository } from '../../test/in-memory-notification.repository.ts';
import { InMemoryOdometerReadingRepository } from '../../test/in-memory-odometer.repository.ts';
import { InMemoryServiceIntervalRepository } from '../../test/in-memory-service-interval.repository.ts';
import { InMemoryServiceInvoiceRepository } from '../../test/in-memory-service-invoice.repository.ts';
import { InMemoryServiceVisitRepository } from '../../test/in-memory-service-visit.repository.ts';
import { InMemoryVehiclePhotoRepository } from '../../test/in-memory-vehicle-photo.repository.ts';
import { InMemoryVehicleRepository } from '../../test/in-memory-vehicle.repository.ts';
import { VEHICLE_CATALOG } from '../vehicle-catalog/vehicle-catalog.data.ts';
import { VehicleCatalog } from '../vehicle-catalog/vehicle-catalog.ts';
import { VehicleService } from '../vehicles/vehicle.service.ts';
import type { CreateVehicleInput } from '../vehicles/vehicle.types.ts';
import {
  EXPENSE_ATTACHMENT_BAD_TYPE,
  EXPIRES_AFTER_PAID,
  ExpenseService,
} from './expense.service.ts';
import type { CreateExpenseInput } from './expense.types.ts';

const ALICE = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BOB = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const NOW = new Date('2026-10-17T10:00:00Z');

const vehicleInput = (threeDigits: string, mileageKm: number): CreateVehicleInput => ({
  nickname: 'تارا',
  plate: { twoDigits: '72', letter: 'ب', threeDigits, provinceCode: '68' },
  makeId: 'iran-khodro',
  modelId: 'tara',
  yearJalali: 1402,
  mileageKm,
});

function expenseInput(overrides: Partial<CreateExpenseInput> = {}): CreateExpenseInput {
  return {
    category: 'third_party_insurance',
    amount: 5850000,
    paidAt: '2024-11-17T00:00:00Z',
    expiresAt: '2025-11-17T00:00:00Z',
    ...overrides,
  };
}

async function validationDetails(promise: Promise<unknown>): Promise<unknown> {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ValidationError);
  return (err as ValidationError).details;
}

describe('ExpenseService', () => {
  let expenses: InMemoryExpenseRepository;
  let attachments: InMemoryExpenseAttachmentRepository;
  let notifications: InMemoryNotificationRepository;
  let vehicleService: VehicleService;
  let service: ExpenseService;
  let vehicleId: string;

  beforeEach(async () => {
    const vehicles = new InMemoryVehicleRepository();
    expenses = new InMemoryExpenseRepository();
    attachments = new InMemoryExpenseAttachmentRepository();
    notifications = new InMemoryNotificationRepository();
    vehicleService = new VehicleService({
      vehicles,
      photos: new InMemoryVehiclePhotoRepository(),
      readings: new InMemoryOdometerReadingRepository(vehicles),
      serviceVisits: new InMemoryServiceVisitRepository(),
      serviceInvoices: new InMemoryServiceInvoiceRepository(),
      serviceIntervals: new InMemoryServiceIntervalRepository(),
      fuelLogs: new InMemoryFuelLogRepository(),
      expenses,
      expenseAttachments: attachments,
      documents: new InMemoryDocumentRepository(),
      documentFiles: new InMemoryDocumentFileRepository(),
      notifications,
      catalog: new VehicleCatalog(VEHICLE_CATALOG),
      now: () => NOW,
    });
    service = new ExpenseService({
      expenses,
      attachments,
      notifications,
      vehicles: vehicleService,
      now: () => NOW,
    });
    vehicleId = (await vehicleService.create(ALICE, vehicleInput('345', 34500))).id;
  });

  const mileage = async () => (await vehicleService.getById(ALICE, vehicleId)).mileageKm;

  describe('create', () => {
    it('saves the expense with nulls for absent optionals, reminder on, and no attachment', async () => {
      const expense = await service.create(ALICE, vehicleId, expenseInput());

      expect(expense).toEqual({
        id: expect.stringMatching(/^[a-f\d]{24}$/),
        vehicleId,
        category: 'third_party_insurance',
        amount: 5850000,
        title: null,
        referenceNumber: null,
        paidAt: new Date('2024-11-17T00:00:00Z'),
        expiresAt: new Date('2025-11-17T00:00:00Z'),
        expiryReminder: true,
        paymentMethod: null,
        issuer: null,
        attachment: null,
        attachmentUrl: null,
        locked: false,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it('keeps an explicit expiryReminder false and a null expiresAt', async () => {
      const expense = await service.create(
        ALICE,
        vehicleId,
        expenseInput({ expiresAt: null, expiryReminder: false }),
      );

      expect(expense).toMatchObject({ expiresAt: null, expiryReminder: false });
    });

    it('never changes the vehicle mileage', async () => {
      await service.create(ALICE, vehicleId, expenseInput());

      expect(await mileage()).toBe(34500);
    });

    it('rejects a paidAt more than 1 minute in the future', async () => {
      const paidAt = new Date(NOW.getTime() + 60_001).toISOString();

      expect(
        await validationDetails(
          service.create(ALICE, vehicleId, expenseInput({ paidAt, expiresAt: null })),
        ),
      ).toEqual({ paidAt: ['Must not be in the future'] });
      expect(expenses.expenses.size).toBe(0);
    });

    it('accepts a paidAt up to 1 minute in the future (clock skew)', async () => {
      const paidAt = new Date(NOW.getTime() + 60_000).toISOString();

      await expect(
        service.create(ALICE, vehicleId, expenseInput({ paidAt, expiresAt: null })),
      ).resolves.toBeDefined();
    });

    it.each([
      ['equal to', '2024-11-17T00:00:00Z'],
      ['before', '2024-11-16T00:00:00Z'],
    ])('rejects an expiresAt %s paidAt', async (_name, expiresAt) => {
      expect(
        await validationDetails(service.create(ALICE, vehicleId, expenseInput({ expiresAt }))),
      ).toEqual({ expiresAt: [EXPIRES_AFTER_PAID] });
    });

    it("returns 404 for another user's vehicle", async () => {
      await expect(service.create(BOB, vehicleId, expenseInput())).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('list', () => {
    it('orders by paidAt desc, then createdAt desc, and carries attachments', async () => {
      const create = async (paidAt: string) =>
        (await service.create(ALICE, vehicleId, expenseInput({ paidAt, expiresAt: null }))).id;
      const oldest = await create('2026-01-01T00:00:00Z');
      const middle = await create('2026-05-01T00:00:00Z');
      const sameDayLater = await create('2026-05-01T00:00:00Z');
      const newest = await create('2026-09-01T00:00:00Z');
      await service.uploadAttachment(ALICE, vehicleId, middle, {
        fileName: 'a.pdf',
        data: PDF_BYTES,
      });

      const list = await service.list(ALICE, vehicleId);

      expect(list.map((e) => e.id)).toEqual([newest, sameDayLater, middle, oldest]);
      expect(list.map((e) => e.attachment !== null)).toEqual([false, false, true, false]);
    });

    it('returns at most 50 expenses', async () => {
      for (let i = 0; i < 51; i++) {
        await service.create(ALICE, vehicleId, expenseInput());
      }

      expect(await service.list(ALICE, vehicleId)).toHaveLength(50);
    });

    it('only returns expenses of that vehicle', async () => {
      const other = await vehicleService.create(ALICE, vehicleInput('222', 0));
      await service.create(ALICE, other.id, expenseInput());

      expect(await service.list(ALICE, vehicleId)).toEqual([]);
    });

    it("returns 404 for another user's vehicle", async () => {
      await expect(service.list(BOB, vehicleId)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('getById', () => {
    it('returns the expense', async () => {
      const created = await service.create(ALICE, vehicleId, expenseInput());

      expect(await service.getById(ALICE, vehicleId, created.id)).toEqual(created);
    });

    it.each([
      ['a malformed id', 'nope'],
      ['an unknown id', '0'.repeat(24)],
    ])('returns 404 for %s', async (_name, id) => {
      await expect(service.getById(ALICE, vehicleId, id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("returns 404 for another vehicle's expense", async () => {
      const other = await vehicleService.create(ALICE, vehicleInput('222', 0));
      const created = await service.create(ALICE, other.id, expenseInput());

      await expect(service.getById(ALICE, vehicleId, created.id)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it("returns 404 for another user's vehicle", async () => {
      const created = await service.create(ALICE, vehicleId, expenseInput());

      await expect(service.getById(BOB, vehicleId, created.id)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('update', () => {
    it('changes only the given fields and keeps the attachment', async () => {
      const created = await service.create(ALICE, vehicleId, expenseInput({ title: 'قدیمی' }));
      await service.uploadAttachment(ALICE, vehicleId, created.id, {
        fileName: 'a.pdf',
        data: PDF_BYTES,
      });

      const updated = await service.update(ALICE, vehicleId, created.id, {
        amount: 6000000,
        title: null,
        issuer: 'نمایندگی ۲۴۸۰',
      });

      expect(updated).toMatchObject({
        id: created.id,
        category: 'third_party_insurance',
        amount: 6000000,
        title: null,
        issuer: 'نمایندگی ۲۴۸۰',
        expiresAt: new Date('2025-11-17T00:00:00Z'),
        attachment: { fileName: 'a.pdf', contentType: 'application/pdf' },
      });
    });

    it('clears the expiry with expiresAt null', async () => {
      const created = await service.create(ALICE, vehicleId, expenseInput());

      const updated = await service.update(ALICE, vehicleId, created.id, { expiresAt: null });

      expect(updated.expiresAt).toBeNull();
    });

    it('checks expiresAt against the merged record when only paidAt changes', async () => {
      const created = await service.create(ALICE, vehicleId, expenseInput());

      expect(
        await validationDetails(
          service.update(ALICE, vehicleId, created.id, { paidAt: '2025-12-01T00:00:00Z' }),
        ),
      ).toEqual({ expiresAt: [EXPIRES_AFTER_PAID] });
    });

    it('checks expiresAt against the merged record when only expiresAt changes', async () => {
      const created = await service.create(ALICE, vehicleId, expenseInput());

      expect(
        await validationDetails(
          service.update(ALICE, vehicleId, created.id, { expiresAt: '2024-01-01T00:00:00Z' }),
        ),
      ).toEqual({ expiresAt: [EXPIRES_AFTER_PAID] });
    });

    it('rejects a future paidAt', async () => {
      const created = await service.create(ALICE, vehicleId, expenseInput());

      expect(
        await validationDetails(
          service.update(ALICE, vehicleId, created.id, {
            paidAt: '2030-01-01T00:00:00Z',
            expiresAt: null,
          }),
        ),
      ).toEqual({ paidAt: ['Must not be in the future'] });
    });

    it("returns 404 for another user's vehicle", async () => {
      const created = await service.create(ALICE, vehicleId, expenseInput());

      await expect(
        service.update(BOB, vehicleId, created.id, { amount: 1 }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('remove', () => {
    it('deletes the expense and its attachment', async () => {
      const created = await service.create(ALICE, vehicleId, expenseInput());
      await service.uploadAttachment(ALICE, vehicleId, created.id, {
        fileName: 'a.pdf',
        data: PDF_BYTES,
      });

      await service.remove(ALICE, vehicleId, created.id);

      expect(expenses.expenses.size).toBe(0);
      expect(attachments.attachments.size).toBe(0);
    });

    it("deletes the expense's notifications only", async () => {
      const removed = await service.create(ALICE, vehicleId, expenseInput());
      const kept = await service.create(ALICE, vehicleId, expenseInput());
      const notificationOf = (refId: string) => ({
        userId: ALICE,
        key: `expense:${refId}`,
        kind: 'expense_expiry' as const,
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
      await notifications.createMany([notificationOf(removed.id), notificationOf(kept.id)]);

      await service.remove(ALICE, vehicleId, removed.id);

      expect([...notifications.notifications.values()].map((n) => n.refId)).toEqual([kept.id]);
    });

    it('returns 404 for an unknown id', async () => {
      await expect(service.remove(ALICE, vehicleId, '0'.repeat(24))).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('attachment', () => {
    let expenseId: string;

    beforeEach(async () => {
      expenseId = (await service.create(ALICE, vehicleId, expenseInput())).id;
    });

    it.each([
      ['PDF', PDF_BYTES, 'application/pdf'],
      ['JPEG', JPEG_BYTES, 'image/jpeg'],
      ['PNG', PNG_BYTES, 'image/png'],
    ])('upload stores a %s and returns the expense with it', async (_name, data, contentType) => {
      const expense = await service.uploadAttachment(ALICE, vehicleId, expenseId, {
        fileName: 'بیمه‌نامه.pdf',
        data,
      });

      expect(expense.attachment).toEqual({
        fileName: 'بیمه‌نامه.pdf',
        contentType,
        sizeBytes: data.length,
        updatedAt: expect.any(Date),
      });
      expect(expense.attachmentUrl).toBe(
        `/api/vehicles/${vehicleId}/expenses/${expenseId}/attachment?v=${expense.attachment!.updatedAt.getTime()}`,
      );
      expect(await service.getAttachment(ALICE, vehicleId, expenseId)).toMatchObject({
        contentType,
        data,
      });
    });

    it.each([
      ['plain text', Buffer.from('nope')],
      ['WebP', WEBP_BYTES],
    ])('upload rejects %s', async (_name, data) => {
      expect(
        await validationDetails(
          service.uploadAttachment(ALICE, vehicleId, expenseId, { fileName: 'x', data }),
        ),
      ).toEqual({ attachment: [EXPENSE_ATTACHMENT_BAD_TYPE] });
    });

    it('upload replaces the previous attachment with a new version', async () => {
      const first = await service.uploadAttachment(ALICE, vehicleId, expenseId, {
        fileName: 'a',
        data: PDF_BYTES,
      });

      const second = await service.uploadAttachment(ALICE, vehicleId, expenseId, {
        fileName: 'b',
        data: JPEG_BYTES,
      });

      expect(second.attachmentUrl).not.toBe(first.attachmentUrl);
      expect(attachments.attachments.size).toBe(1);
    });

    it('getAttachment returns 404 without an attachment', async () => {
      await expect(service.getAttachment(ALICE, vehicleId, expenseId)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('deleteAttachment removes it and is idempotent', async () => {
      await service.uploadAttachment(ALICE, vehicleId, expenseId, {
        fileName: 'a',
        data: PDF_BYTES,
      });

      const expense = await service.deleteAttachment(ALICE, vehicleId, expenseId);
      const again = await service.deleteAttachment(ALICE, vehicleId, expenseId);

      expect(expense).toMatchObject({ id: expenseId, attachment: null, attachmentUrl: null });
      expect(again.attachment).toBeNull();
      expect(attachments.attachments.size).toBe(0);
    });

    it("returns 404 for another user's vehicle", async () => {
      await expect(
        service.uploadAttachment(BOB, vehicleId, expenseId, { fileName: 'a', data: PDF_BYTES }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
