import { NotFoundError, ValidationError } from '../../shared/errors.ts';
import { detectFileType, type FileContentType } from '../../shared/file-type.ts';
import type { NotificationRepository } from '../notifications/notification.repository.ts';
import { FUTURE_TOLERANCE_MS } from '../vehicles/odometer.service.ts';
import type { VehicleService } from '../vehicles/vehicle.service.ts';
import type { ExpenseAttachmentRepository } from './expense-attachment.repository.ts';
import type { ExpenseRepository } from './expense.repository.ts';
import type {
  CreateExpenseInput,
  Expense,
  ExpenseAttachment,
  ExpenseAttachmentMeta,
  ExpenseRecord,
  UpdateExpenseInput,
} from './expense.types.ts';

export interface ExpenseServiceDeps {
  expenses: ExpenseRepository;
  attachments: ExpenseAttachmentRepository;
  /** A deleted expense's notifications go too. */
  notifications: NotificationRepository;
  /** Ownership checks come from here. Expenses never touch the vehicle's mileage. */
  vehicles: VehicleService;
  now: () => Date;
}

export const EXPENSE_LIST_LIMIT = 50;
export const EXPENSE_ATTACHMENT_CONTENT_TYPES: readonly FileContentType[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
];
export const EXPENSE_ATTACHMENT_BAD_TYPE = 'Must be a PDF, JPEG or PNG file';
export const EXPIRES_AFTER_PAID = 'Must be after paidAt';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export interface AttachmentUpload {
  fileName: string;
  data: Uint8Array;
}

/** The API shape of an expense: the record plus its attachment facts and URL. */
export function toExpense(
  expense: ExpenseRecord,
  attachment: ExpenseAttachmentMeta | null,
): Expense {
  return {
    ...expense,
    attachment,
    attachmentUrl: attachment
      ? `/api/vehicles/${expense.vehicleId}/expenses/${expense.id}/attachment?v=${attachment.updatedAt.getTime()}`
      : null,
  };
}

/** Expenses of a user's vehicle. Another user's vehicle or expense is "not found". */
export class ExpenseService {
  constructor(private readonly deps: ExpenseServiceDeps) {}

  /** Newest `paidAt` first, at most 50. */
  async list(userId: string, vehicleId: string): Promise<Expense[]> {
    const vehicle = await this.deps.vehicles.getById(userId, vehicleId);
    const expenses = await this.deps.expenses.listByVehicle(vehicle.id, EXPENSE_LIST_LIMIT);
    const metas = await this.deps.attachments.findMetas(expenses.map((expense) => expense.id));
    return expenses.map((expense) => toExpense(expense, metas.get(expense.id) ?? null));
  }

  async getById(userId: string, vehicleId: string, expenseId: string): Promise<Expense> {
    const expense = await this.findOwned(userId, vehicleId, expenseId);
    return this.withAttachment(expense);
  }

  async create(userId: string, vehicleId: string, input: CreateExpenseInput): Promise<Expense> {
    const vehicle = await this.deps.vehicles.getById(userId, vehicleId);
    const paidAt = new Date(input.paidAt);
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    this.validate({ changedPaidAt: paidAt, paidAt, expiresAt });

    const expense = await this.deps.expenses.create({
      vehicleId: vehicle.id,
      category: input.category,
      amount: input.amount,
      title: input.title ?? null,
      referenceNumber: input.referenceNumber ?? null,
      paidAt,
      expiresAt,
      expiryReminder: input.expiryReminder ?? true,
      paymentMethod: input.paymentMethod ?? null,
      issuer: input.issuer ?? null,
    });
    return toExpense(expense, null);
  }

  /** `expiresAt: null` clears the expiry. The `expiresAt > paidAt` rule is checked on the merged record. */
  async update(
    userId: string,
    vehicleId: string,
    expenseId: string,
    input: UpdateExpenseInput,
  ): Promise<Expense> {
    const existing = await this.findOwned(userId, vehicleId, expenseId);
    const changedPaidAt = input.paidAt === undefined ? undefined : new Date(input.paidAt);
    const changedExpiresAt =
      input.expiresAt === undefined
        ? undefined
        : input.expiresAt === null
          ? null
          : new Date(input.expiresAt);
    this.validate({
      changedPaidAt,
      paidAt: changedPaidAt ?? existing.paidAt,
      expiresAt: changedExpiresAt === undefined ? existing.expiresAt : changedExpiresAt,
    });

    const expense = await this.deps.expenses.update(existing.id, {
      category: input.category,
      amount: input.amount,
      title: input.title,
      referenceNumber: input.referenceNumber,
      paidAt: changedPaidAt,
      expiresAt: changedExpiresAt,
      expiryReminder: input.expiryReminder,
      paymentMethod: input.paymentMethod,
      issuer: input.issuer,
    });
    return this.withAttachment(expense);
  }

  /** Deletes the attachment and notifications too. */
  async remove(userId: string, vehicleId: string, expenseId: string): Promise<void> {
    const expense = await this.findOwned(userId, vehicleId, expenseId);
    await this.deps.attachments.deleteByExpenseIds([expense.id]);
    await this.deps.notifications.deleteByRefIds([expense.id]);
    await this.deps.expenses.delete(expense.id);
  }

  /** Stores (or replaces) the attachment. The type comes from the magic bytes, not the client. */
  async uploadAttachment(
    userId: string,
    vehicleId: string,
    expenseId: string,
    { fileName, data }: AttachmentUpload,
  ): Promise<Expense> {
    const expense = await this.findOwned(userId, vehicleId, expenseId);
    const contentType = detectFileType(data, EXPENSE_ATTACHMENT_CONTENT_TYPES);
    if (!contentType) throw new ValidationError({ attachment: [EXPENSE_ATTACHMENT_BAD_TYPE] });
    const meta = await this.deps.attachments.save(expense.id, { fileName, contentType, data });
    return toExpense(expense, meta);
  }

  async getAttachment(
    userId: string,
    vehicleId: string,
    expenseId: string,
  ): Promise<ExpenseAttachment> {
    const expense = await this.findOwned(userId, vehicleId, expenseId);
    const attachment = await this.deps.attachments.findByExpenseId(expense.id);
    if (!attachment) throw new NotFoundError('Attachment');
    return attachment;
  }

  /** Idempotent: deleting a missing attachment still succeeds. */
  async deleteAttachment(userId: string, vehicleId: string, expenseId: string): Promise<Expense> {
    const expense = await this.findOwned(userId, vehicleId, expenseId);
    await this.deps.attachments.deleteByExpenseIds([expense.id]);
    return toExpense(expense, null);
  }

  /** Rules zod can't express: the date bound depends on today, and the expiry on the merged record. */
  private validate({
    changedPaidAt,
    paidAt,
    expiresAt,
  }: {
    /** Only a new `paidAt` is checked against today; an existing one was checked when it was set. */
    changedPaidAt?: Date;
    paidAt: Date;
    expiresAt: Date | null;
  }): void {
    const details: Record<string, string[]> = {};
    if (
      changedPaidAt &&
      changedPaidAt.getTime() > this.deps.now().getTime() + FUTURE_TOLERANCE_MS
    ) {
      details.paidAt = ['Must not be in the future'];
    }
    if (expiresAt && expiresAt.getTime() <= paidAt.getTime()) {
      details.expiresAt = [EXPIRES_AFTER_PAID];
    }
    if (Object.keys(details).length > 0) throw new ValidationError(details);
  }

  /** 404 for another user's vehicle, a malformed id, an unknown id, or another vehicle's expense. */
  private async findOwned(
    userId: string,
    vehicleId: string,
    expenseId: string,
  ): Promise<ExpenseRecord> {
    const vehicle = await this.deps.vehicles.getById(userId, vehicleId);
    const expense = OBJECT_ID_PATTERN.test(expenseId)
      ? await this.deps.expenses.findForVehicle(expenseId, vehicle.id)
      : null;
    if (!expense) throw new NotFoundError('Expense');
    return expense;
  }

  private async withAttachment(expense: ExpenseRecord): Promise<Expense> {
    const metas = await this.deps.attachments.findMetas([expense.id]);
    return toExpense(expense, metas.get(expense.id) ?? null);
  }
}
