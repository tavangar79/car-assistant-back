import { inRange, type DateRange } from '../../shared/date-range.ts';
import type { ExpenseAttachmentRepository } from '../expenses/expense-attachment.repository.ts';
import type { ExpenseRepository } from '../expenses/expense.repository.ts';
import { toExpense } from '../expenses/expense.service.ts';
import { computeEconomy } from '../fuel-logs/compute-economy.ts';
import type { FuelLogRepository } from '../fuel-logs/fuel-log.repository.ts';
import { toFuelLog } from '../fuel-logs/fuel-log.service.ts';
import type { ServiceItemCatalog } from '../service-items/service-items.ts';
import type { ServiceInvoiceRepository } from '../service-visits/service-invoice.repository.ts';
import type { ServiceVisitRepository } from '../service-visits/service-visit.repository.ts';
import { toServiceVisit } from '../service-visits/service-visit.service.ts';
import type { VehicleService } from '../vehicles/vehicle.service.ts';
import {
  encodeCursor,
  type HistoryCategory,
  type HistoryCursor,
  type HistoryEntry,
  type HistoryPage,
  type HistoryQuery,
  type HistorySummary,
} from './history.types.ts';

export interface HistoryServiceDeps {
  /** Ownership checks and the caller's garage come from here. */
  vehicles: VehicleService;
  visits: ServiceVisitRepository;
  invoices: ServiceInvoiceRepository;
  fuelLogs: FuelLogRepository;
  expenses: ExpenseRepository;
  attachments: ExpenseAttachmentRepository;
  /** Maps a line item to its catalog category. */
  items: ServiceItemCatalog;
}

/** `occurredAt` desc, then `id` desc. */
const newestFirst = (a: HistoryEntry, b: HistoryEntry) =>
  b.occurredAt.getTime() - a.occurredAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

const isAfterCursor = (entry: HistoryEntry, cursor: HistoryCursor) =>
  entry.occurredAt < cursor.occurredAt ||
  (entry.occurredAt.getTime() === cursor.occurredAt.getTime() && entry.id < cursor.id);

const round1 = (value: number) => Math.round(value * 10) / 10;

function summarize(entries: HistoryEntry[]): HistorySummary {
  const litres = entries
    .filter((entry) => entry.fuelLog && entry.fuelLog.fuelType !== 'cng')
    .reduce((sum, entry) => sum + entry.fuelLog!.volume, 0);
  return {
    totalCost: entries.reduce((sum, entry) => sum + entry.cost, 0),
    serviceCount: entries.filter((entry) => entry.type === 'service').length,
    fuelVolume: round1(litres),
    entryCount: entries.length,
  };
}

/** One timeline of service visits, fuel logs and expenses across a user's garage. */
export class HistoryService {
  constructor(private readonly deps: HistoryServiceDeps) {}

  /** A page of the filtered timeline. Another user's (or a malformed) vehicle id is "not found". */
  async list(userId: string, query: HistoryQuery): Promise<HistoryPage> {
    const vehicleIds = await this.ownedVehicleIds(userId, query.vehicleIds);
    const dated = await this.entriesOf(vehicleIds, { from: query.from, to: query.to });
    const entries = dated.filter((entry) => this.matches(entry, query));

    const { cursor, limit } = query;
    const rest = cursor ? entries.filter((entry) => isAfterCursor(entry, cursor)) : entries;
    const page = rest.slice(0, limit);
    return {
      entries: page,
      nextCursor: rest.length > limit ? encodeCursor(page.at(-1)!) : null,
      summary: cursor ? null : summarize(entries),
    };
  }

  /**
   * Every entry of these vehicles whose date is in `range`, newest first. Fuel economy is computed
   * over all of a vehicle's logs, not only those in range.
   */
  async entriesOf(vehicleIds: string[], range: DateRange = {}): Promise<HistoryEntry[]> {
    const { visits, invoices, fuelLogs, expenses, attachments } = this.deps;

    const visitRecords = await visits.listByVehicles(vehicleIds, range);
    const invoiceMetas = await invoices.findMetas(visitRecords.map((visit) => visit.id));
    const expenseRecords = await expenses.listByVehicles(vehicleIds, range);
    const attachmentMetas = await attachments.findMetas(expenseRecords.map((e) => e.id));

    const entries: HistoryEntry[] = [];
    for (const record of visitRecords) {
      const service = toServiceVisit(record, invoiceMetas.get(record.id) ?? null);
      entries.push({
        type: 'service',
        id: service.id,
        vehicleId: service.vehicleId,
        occurredAt: service.serviceDate,
        cost: service.totalCost,
        hasAttachment: service.invoice !== null,
        service,
        fuelLog: null,
        expense: null,
      });
    }
    for (const vehicleId of vehicleIds) {
      const logs = await fuelLogs.listByVehicle(vehicleId);
      const economy = computeEconomy(logs);
      for (const record of logs.filter((log) => inRange(log.fueledAt, range))) {
        const fuelLog = toFuelLog(record, economy);
        entries.push({
          type: 'fuel',
          id: fuelLog.id,
          vehicleId: fuelLog.vehicleId,
          occurredAt: fuelLog.fueledAt,
          cost: fuelLog.totalCost,
          hasAttachment: false,
          service: null,
          fuelLog,
          expense: null,
        });
      }
    }
    for (const record of expenseRecords) {
      const expense = toExpense(record, attachmentMetas.get(record.id) ?? null);
      entries.push({
        type: 'expense',
        id: expense.id,
        vehicleId: expense.vehicleId,
        occurredAt: expense.paidAt,
        cost: expense.amount,
        hasAttachment: expense.attachment !== null,
        service: null,
        fuelLog: null,
        expense,
      });
    }
    return entries.sort(newestFirst);
  }

  /** All of the caller's vehicles when none are asked for; otherwise each must be theirs (404). */
  private async ownedVehicleIds(userId: string, requested?: string[]): Promise<string[]> {
    if (!requested) return (await this.deps.vehicles.list(userId)).map((vehicle) => vehicle.id);
    const ids: string[] = [];
    for (const id of new Set(requested)) {
      ids.push((await this.deps.vehicles.getById(userId, id)).id);
    }
    return ids;
  }

  private matches(entry: HistoryEntry, query: HistoryQuery): boolean {
    if (query.type !== 'all' && entry.type !== query.type) return false;
    if (query.hasAttachment !== undefined && entry.hasAttachment !== query.hasAttachment) {
      return false;
    }
    return !query.categories || this.inCategories(entry, query.categories);
  }

  /** A visit with any item in the set; an expense other than `other` when `legal` is in the set; never fuel. */
  private inCategories(entry: HistoryEntry, categories: HistoryCategory[]): boolean {
    const wanted = new Set<string>(categories);
    if (entry.service) {
      return entry.service.lineItems.some((item) =>
        wanted.has(this.deps.items.categoryOf(item.itemId) ?? ''),
      );
    }
    if (entry.expense) return wanted.has('legal') && entry.expense.category !== 'other';
    return false;
  }
}
