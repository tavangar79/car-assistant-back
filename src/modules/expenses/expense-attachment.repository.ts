import type { PrismaClient } from '@prisma/client';
import type {
  ExpenseAttachmentMeta,
  NewExpenseAttachment,
  StoredExpenseAttachment,
} from './expense.types.ts';

export interface ExpenseAttachmentRepository {
  findByExpenseId(expenseId: string): Promise<StoredExpenseAttachment | null>;
  /** Attachment facts, keyed by expense id. Expenses without a file are absent. */
  findMetas(expenseIds: string[]): Promise<Map<string, ExpenseAttachmentMeta>>;
  /** Creates or replaces the expense's attachment row. */
  save(expenseId: string, attachment: NewExpenseAttachment): Promise<ExpenseAttachmentMeta>;
  /** The storage keys of the removed rows; expenses without an attachment add none. */
  deleteByExpenseIds(expenseIds: string[]): Promise<string[]>;
}

const META_FIELDS = {
  fileName: true,
  contentType: true,
  sizeBytes: true,
  updatedAt: true,
} as const;

export class PrismaExpenseAttachmentRepository implements ExpenseAttachmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByExpenseId(expenseId: string): Promise<StoredExpenseAttachment | null> {
    return this.prisma.expenseAttachment.findUnique({
      where: { expenseId },
      select: { ...META_FIELDS, storageKey: true },
    });
  }

  async findMetas(expenseIds: string[]): Promise<Map<string, ExpenseAttachmentMeta>> {
    const attachments = await this.prisma.expenseAttachment.findMany({
      where: { expenseId: { in: expenseIds } },
      select: { ...META_FIELDS, expenseId: true },
    });
    return new Map(attachments.map(({ expenseId, ...meta }) => [expenseId, meta]));
  }

  save(expenseId: string, attachment: NewExpenseAttachment): Promise<ExpenseAttachmentMeta> {
    return this.prisma.expenseAttachment.upsert({
      where: { expenseId },
      create: { expenseId, ...attachment },
      update: attachment,
      select: META_FIELDS,
    });
  }

  async deleteByExpenseIds(expenseIds: string[]): Promise<string[]> {
    if (expenseIds.length === 0) return [];
    const where = { expenseId: { in: expenseIds } };
    const rows = await this.prisma.expenseAttachment.findMany({
      where,
      select: { storageKey: true },
    });
    await this.prisma.expenseAttachment.deleteMany({ where });
    return rows.map((row) => row.storageKey);
  }
}
