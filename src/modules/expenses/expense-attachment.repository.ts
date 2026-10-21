import type { PrismaClient } from '@prisma/client';
import type {
  ExpenseAttachment,
  ExpenseAttachmentMeta,
  NewExpenseAttachment,
} from './expense.types.ts';

export interface ExpenseAttachmentRepository {
  findByExpenseId(expenseId: string): Promise<ExpenseAttachment | null>;
  /** Attachment facts without bytes, keyed by expense id. Expenses without a file are absent. */
  findMetas(expenseIds: string[]): Promise<Map<string, ExpenseAttachmentMeta>>;
  /** Creates or replaces the expense's attachment. */
  save(expenseId: string, attachment: NewExpenseAttachment): Promise<ExpenseAttachmentMeta>;
  /** No-op for expenses without an attachment. */
  deleteByExpenseIds(expenseIds: string[]): Promise<void>;
}

const META_FIELDS = {
  fileName: true,
  contentType: true,
  sizeBytes: true,
  updatedAt: true,
} as const;

export class PrismaExpenseAttachmentRepository implements ExpenseAttachmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByExpenseId(expenseId: string): Promise<ExpenseAttachment | null> {
    return this.prisma.expenseAttachment.findUnique({
      where: { expenseId },
      select: { ...META_FIELDS, data: true },
    });
  }

  async findMetas(expenseIds: string[]): Promise<Map<string, ExpenseAttachmentMeta>> {
    const attachments = await this.prisma.expenseAttachment.findMany({
      where: { expenseId: { in: expenseIds } },
      select: { ...META_FIELDS, expenseId: true },
    });
    return new Map(attachments.map(({ expenseId, ...meta }) => [expenseId, meta]));
  }

  save(
    expenseId: string,
    { fileName, contentType, data }: NewExpenseAttachment,
  ): Promise<ExpenseAttachmentMeta> {
    // Prisma wants bytes backed by a plain ArrayBuffer; a Node Buffer may sit on a shared pool.
    const attachment = {
      fileName,
      contentType,
      sizeBytes: data.byteLength,
      data: new Uint8Array(data),
    };
    return this.prisma.expenseAttachment.upsert({
      where: { expenseId },
      create: { expenseId, ...attachment },
      update: attachment,
      select: META_FIELDS,
    });
  }

  async deleteByExpenseIds(expenseIds: string[]): Promise<void> {
    if (expenseIds.length === 0) return;
    await this.prisma.expenseAttachment.deleteMany({ where: { expenseId: { in: expenseIds } } });
  }
}
