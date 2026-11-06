import type { ExpenseAttachmentRepository } from '../modules/expenses/expense-attachment.repository.ts';
import type {
  ExpenseAttachmentMeta,
  NewExpenseAttachment,
  StoredExpenseAttachment,
} from '../modules/expenses/expense.types.ts';

const toMeta = ({
  fileName,
  contentType,
  sizeBytes,
  updatedAt,
}: StoredExpenseAttachment): ExpenseAttachmentMeta => ({
  fileName,
  contentType,
  sizeBytes,
  updatedAt,
});

export class InMemoryExpenseAttachmentRepository implements ExpenseAttachmentRepository {
  readonly attachments = new Map<string, StoredExpenseAttachment>();
  /** Each save is 1 ms later than the previous one, so `attachmentUrl` always changes. */
  private clock = Date.UTC(2026, 0, 1);

  async findByExpenseId(expenseId: string): Promise<StoredExpenseAttachment | null> {
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

  async save(expenseId: string, attachment: NewExpenseAttachment): Promise<ExpenseAttachmentMeta> {
    const saved: StoredExpenseAttachment = { ...attachment, updatedAt: new Date(this.clock++) };
    this.attachments.set(expenseId, saved);
    return toMeta(saved);
  }

  async deleteByExpenseIds(expenseIds: string[]): Promise<string[]> {
    const keys: string[] = [];
    for (const id of expenseIds) {
      const attachment = this.attachments.get(id);
      if (attachment) keys.push(attachment.storageKey);
      this.attachments.delete(id);
    }
    return keys;
  }
}
