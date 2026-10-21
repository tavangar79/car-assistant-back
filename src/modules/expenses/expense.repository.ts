import type { PrismaClient } from '@prisma/client';
import type { ExpenseChanges, ExpenseRecord, NewExpense } from './expense.types.ts';

export interface ExpenseRepository {
  /** Newest `paidAt` first, then newest `createdAt`. */
  listByVehicle(vehicleId: string, limit: number): Promise<ExpenseRecord[]>;
  /** The expense only if it belongs to the vehicle. */
  findForVehicle(id: string, vehicleId: string): Promise<ExpenseRecord | null>;
  create(expense: NewExpense): Promise<ExpenseRecord>;
  /** `expiresAt: null` clears it; `undefined` leaves it. */
  update(id: string, changes: ExpenseChanges): Promise<ExpenseRecord>;
  delete(id: string): Promise<void>;
  /** Deletes every expense of the vehicle and returns their ids (so attachments can go too). */
  deleteByVehicle(vehicleId: string): Promise<string[]>;
}

export class PrismaExpenseRepository implements ExpenseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listByVehicle(vehicleId: string, limit: number): Promise<ExpenseRecord[]> {
    return this.prisma.expense.findMany({
      where: { vehicleId },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
  }

  findForVehicle(id: string, vehicleId: string): Promise<ExpenseRecord | null> {
    return this.prisma.expense.findFirst({ where: { id, vehicleId } });
  }

  create(expense: NewExpense): Promise<ExpenseRecord> {
    return this.prisma.expense.create({ data: expense });
  }

  update(id: string, changes: ExpenseChanges): Promise<ExpenseRecord> {
    return this.prisma.expense.update({ where: { id }, data: changes });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.expense.delete({ where: { id } });
  }

  async deleteByVehicle(vehicleId: string): Promise<string[]> {
    const expenses = await this.prisma.expense.findMany({
      where: { vehicleId },
      select: { id: true },
    });
    await this.prisma.expense.deleteMany({ where: { vehicleId } });
    return expenses.map((expense) => expense.id);
  }
}
