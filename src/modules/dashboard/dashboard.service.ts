import { addJalaliMonths, jalaliMonthOf, jalaliYearStart } from '../../lib/jalali.ts';
import type { HistoryService } from '../history/history.service.ts';
import type { HistoryEntry } from '../history/history.types.ts';
import type { ServiceIntervalService } from '../service-intervals/service-interval.service.ts';
import type { VehicleService } from '../vehicles/vehicle.service.ts';
import { DASHBOARD_MONTHS, type Dashboard, type DashboardMonth } from './dashboard.types.ts';

export interface DashboardServiceDeps {
  /** The caller's garage, in garage order. */
  vehicles: VehicleService;
  /** Every cost record (services, fuel, expenses) with its cost and attachment flag. */
  history: HistoryService;
  /** What is due per vehicle; reused so the rules live in one place. */
  intervals: ServiceIntervalService;
  now: () => Date;
}

const sumCost = (entries: HistoryEntry[]) => entries.reduce((sum, entry) => sum + entry.cost, 0);

const NEEDS_ATTENTION = new Set(['overdue', 'due_soon']);

/** The home screen: this year's spend, invoices, what needs attention, and the last 6 Jalali months. */
export class DashboardService {
  constructor(private readonly deps: DashboardServiceDeps) {}

  async get(userId: string): Promise<Dashboard> {
    const now = this.deps.now();
    const vehicleIds = (await this.deps.vehicles.list(userId)).map((vehicle) => vehicle.id);
    const entries = await this.deps.history.entriesOf(vehicleIds);

    const yearStart = jalaliYearStart(now);
    const thisYear = entries.filter(
      (entry) => entry.occurredAt >= yearStart && entry.occurredAt <= now,
    );
    const ofVehicle = (list: HistoryEntry[], vehicleId: string) =>
      list.filter((entry) => entry.vehicleId === vehicleId);

    const vehicles = [];
    for (const vehicleId of vehicleIds) {
      const due = await this.deps.intervals.due(userId, vehicleId);
      vehicles.push({
        vehicleId,
        attentionCount: due.items.filter((item) => NEEDS_ATTENTION.has(item.status)).length,
        yearTotalCost: sumCost(ofVehicle(thisYear, vehicleId)),
      });
    }

    const months: DashboardMonth[] = [];
    for (let back = DASHBOARD_MONTHS - 1; back >= 0; back--) {
      const from = addJalaliMonths(now, -back);
      const to = addJalaliMonths(now, -back + 1);
      const inMonth = entries.filter((entry) => entry.occurredAt >= from && entry.occurredAt < to);
      const { year, month } = jalaliMonthOf(from);
      months.push({
        jalaliYear: year,
        jalaliMonth: month,
        from,
        to,
        totalCost: sumCost(inMonth),
        byVehicle: vehicleIds.map((vehicleId) => ({
          vehicleId,
          totalCost: sumCost(ofVehicle(inMonth, vehicleId)),
        })),
      });
    }

    return {
      jalaliYear: jalaliMonthOf(now).year,
      yearTotalCost: sumCost(thisYear),
      invoiceCount: entries.filter((entry) => entry.hasAttachment).length,
      attentionCount: vehicles.reduce((sum, vehicle) => sum + vehicle.attentionCount, 0),
      vehicles,
      months,
    };
  }
}
