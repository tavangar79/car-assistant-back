import type { ExpenseAttachmentRepository } from '../modules/expenses/expense-attachment.repository.ts';
import type {
  ExpenseAttachment,
  ExpenseAttachmentMeta,
  NewExpenseAttachment,
} from '../modules/expenses/expense.types.ts';

const toMeta = ({
  fileName,
  contentType,
  sizeBytes,
  updatedAt,
}: ExpenseAttachment): ExpenseAttachmentMeta => ({
  fileName,
  contentType,
  sizeBytes,
  updatedAt,
});

export class InMemoryExpenseAttachmentRepository implements ExpenseAttachmentRepository {
  readonly attachments = new Map<string, ExpenseAttachment>();
  /** Each save is 1 ms later than the previous one, so `attachmentUrl` always changes. */
  private clock = Date.UTC(2026, 0, 1);

  async findByExpenseId(expenseId: string): Promise<ExpenseAttachment | null> {
    return this.attachments.get(expenseId) ?? null;
  }

  async findMetas(expenseIds: string[]): Promise<Map<string, ExpenseAttachmentMeta>> {
    const result = new Map<string, ExpenseAttachmentMeta>();
    for (const id of expenseIds) {
      const attachment = this.attachments.get(id);
      if (attachment) result.set(id, toMeta(attachment));
    }
    return result;
  }

  async save(
    expenseId: string,
    attachment: NewExpenseAttachment,
  ): Promise<ExpenseAttachmentMeta> {
    const saved: ExpenseAttachment = {
      ...attachment,
      sizeBytes: attachment.data.byteLength,
      updatedAt: new Date(this.clock++),
    };
    this.attachments.set(expenseId, saved);
    return toMeta(saved);
  }

  async deleteByExpenseIds(expenseIds: string[]): Promise<void> {
    for (const id of expenseIds) this.attachments.delete(id);
  }
}
