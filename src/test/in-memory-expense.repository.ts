import { randomBytes } from 'node:crypto';
import type { ExpenseRepository } from '../modules/expenses/expense.repository.ts';
import type {
  ExpenseChanges,
  ExpenseRecord,
  NewExpense,
} from '../modules/expenses/expense.types.ts';

export class InMemoryExpenseRepository implements ExpenseRepository {
  readonly expenses = new Map<string, ExpenseRecord>();
  /** Each write is 1 ms later than the previous one, so "newest" is deterministic. */
  private clock = Date.UTC(2026, 0, 1);

  async listByVehicle(vehicleId: string, limit: number): Promise<ExpenseRecord[]> {
    return [...this.expenses.values()]
      .filter((expense) => expense.vehicleId === vehicleId)
      .sort(
        (a, b) =>
          b.paidAt.getTime() - a.paidAt.getTime() || b.createdAt.getTime() - a.createdAt.getTime(),
      )
      .slice(0, limit);
  }

  async findForVehicle(id: string, vehicleId: string): Promise<ExpenseRecord | null> {
    const expense = this.expenses.get(id);
    return expense?.vehicleId === vehicleId ? expense : null;
  }

  async create(input: NewExpense): Promise<ExpenseRecord> {
    const now = new Date(this.clock++);
    const expense: ExpenseRecord = {
      id: randomBytes(12).toString('hex'),
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.expenses.set(expense.id, expense);
    return expense;
  }

  async update(id: string, changes: ExpenseChanges): Promise<ExpenseRecord> {
    const existing = this.expenses.get(id);
    if (!existing) throw new Error(`Expense ${id} not found`);
    const defined = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined),
    );
    const updated: ExpenseRecord = { ...existing, ...defined, updatedAt: new Date(this.clock++) };
    this.expenses.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.expenses.delete(id);
  }

  async deleteByVehicle(vehicleId: string): Promise<string[]> {
    const ids = [...this.expenses.values()]
      .filter((expense) => expense.vehicleId === vehicleId)
      .map((expense) => expense.id);
    for (const id of ids) this.expenses.delete(id);
    return ids;
  }
}
