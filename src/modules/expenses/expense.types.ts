import { z } from 'zod';

export const EXPENSE_CATEGORIES = [
  'third_party_insurance',
  'body_insurance',
  'fine',
  'toll',
  'inspection',
  'other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_PAYMENT_METHODS = ['online', 'pos'] as const;
export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];

const text = (max: number) => z.string().trim().min(1).max(max);

// "Not in the future" depends on today, and `expiresAt > paidAt` on the merged record, so ExpenseService checks both.
export const createExpenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().int().min(1),
  title: text(100).nullish(),
  referenceNumber: text(60).nullish(),
  paidAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }).nullish(),
  /** Defaults to true (ExpenseService applies it). */
  expiryReminder: z.boolean().optional(),
  paymentMethod: z.enum(EXPENSE_PAYMENT_METHODS).nullish(),
  issuer: text(100).nullish(),
});

/** `expiresAt: null` clears the expiry. */
export const updateExpenseSchema = createExpenseSchema.partial();

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

/** An expense as stored. */
export interface ExpenseRecord {
  id: string;
  vehicleId: string;
  category: string;
  /** Toman. */
  amount: number;
  title: string | null;
  referenceNumber: string | null;
  paidAt: Date;
  expiresAt: Date | null;
  /** The "ارسال اعلان یادآور" checkbox; used by Phase 5 notifications. */
  expiryReminder: boolean;
  paymentMethod: string | null;
  issuer: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewExpense = Omit<ExpenseRecord, 'id' | 'createdAt' | 'updatedAt'>;
export type ExpenseChanges = Partial<Omit<NewExpense, 'vehicleId'>>;

/** Attachment facts without the bytes. */
export interface ExpenseAttachmentMeta {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  updatedAt: Date;
}

export interface ExpenseAttachment extends ExpenseAttachmentMeta {
  data: Uint8Array;
}

export type NewExpenseAttachment = Omit<ExpenseAttachment, 'updatedAt' | 'sizeBytes'>;

/** An expense as exposed by the API. */
export interface Expense extends ExpenseRecord {
  attachment: ExpenseAttachmentMeta | null;
  /** `/api/vehicles/:id/expenses/:expenseId/attachment?v=<updatedAt ms>`, or null without a file. */
  attachmentUrl: string | null;
  /** Created by a previous owner: read-only (see record-lock.ts). */
  locked: boolean;
}
