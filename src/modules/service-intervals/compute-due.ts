import type { ServiceIntervalDefinition } from './service-interval.types.ts';

export type DueStatus = 'overdue' | 'due_soon' | 'upcoming' | 'ok';

export const DUE_SOON_KM = 500;
export const DUE_SOON_DAYS = 14;
export const UPCOMING_KM = 1500;
export const UPCOMING_DAYS = 30;

const DAY_MS = 86_400_000;

/** An interval with the vehicle's effective km / months (override or default). */
export interface DueInterval extends ServiceIntervalDefinition {
  km: number;
  months: number;
}

/** The parts of a service visit the computation needs. */
export interface DueVisit {
  id: string;
  serviceDate: Date;
  odometerKm: number;
  lineItems: { itemId: string; nextDueKm: number | null; nextDueMonths: number | null }[];
}

export interface DueInput {
  asOf: Date;
  /** The vehicle's current mileage. */
  mileageKm: number;
  intervals: DueInterval[];
  /** Every visit of the vehicle, in any order. */
  visits: DueVisit[];
  /** Baseline for an interval no visit covers: the earliest odometer reading, else the vehicle's creation. */
  fallback: { km: number; date: Date };
}

export interface DueItem {
  intervalId: string;
  title: string;
  description: string;
  icon: string;
  coversItemIds: string[];
  status: DueStatus;
  baselineKm: number;
  baselineDate: Date;
  /** The covering visit, or null when the fallback baseline was used. */
  baselineServiceId: string | null;
  dueKm: number;
  dueDate: Date;
  /** Negative when overdue. */
  remainingKm: number;
  /** Negative when overdue. */
  remainingDays: number;
}

const STATUS_RANK: Record<DueStatus, number> = { overdue: 0, due_soon: 1, upcoming: 2, ok: 3 };

const worse = (a: DueStatus, b: DueStatus) => (STATUS_RANK[a] <= STATUS_RANK[b] ? a : b);

function kmStatus(remainingKm: number): DueStatus {
  if (remainingKm <= 0) return 'overdue';
  if (remainingKm <= DUE_SOON_KM) return 'due_soon';
  if (remainingKm <= UPCOMING_KM) return 'upcoming';
  return 'ok';
}

function dayStatus(remainingDays: number): DueStatus {
  if (remainingDays <= 0) return 'overdue';
  if (remainingDays <= DUE_SOON_DAYS) return 'due_soon';
  if (remainingDays <= UPCOMING_DAYS) return 'upcoming';
  return 'ok';
}

/** Calendar months in UTC; a day past the end of the target month rolls over (31 Jan + 1 → 3 Mar). */
function addMonthsUtc(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/** The latest visit (by `serviceDate`, then id order) with a line item the interval covers. */
function latestCoveringVisit(visits: DueVisit[], interval: DueInterval): DueVisit | null {
  let latest: DueVisit | null = null;
  for (const visit of visits) {
    if (!visit.lineItems.some((item) => interval.coversItemIds.includes(item.itemId))) continue;
    if (!latest || visit.serviceDate.getTime() >= latest.serviceDate.getTime()) latest = visit;
  }
  return latest;
}

function dueItem(interval: DueInterval, input: DueInput): DueItem {
  const visit = latestCoveringVisit(input.visits, interval);
  const baselineKm = visit ? visit.odometerKm : input.fallback.km;
  const baselineDate = visit ? visit.serviceDate : input.fallback.date;

  // A sticker reminder on the covering line item replaces the interval for this one cycle.
  const sticker = visit?.lineItems.find((item) => interval.coversItemIds.includes(item.itemId));
  const km = sticker?.nextDueKm ?? interval.km;
  const months = sticker?.nextDueMonths ?? interval.months;

  const dueKm = baselineKm + km;
  const dueDate = addMonthsUtc(baselineDate, months);
  const remainingKm = dueKm - input.mileageKm;
  const remainingDays = Math.floor((dueDate.getTime() - input.asOf.getTime()) / DAY_MS);

  return {
    intervalId: interval.id,
    title: interval.title,
    description: interval.description,
    icon: interval.icon,
    coversItemIds: interval.coversItemIds,
    status: worse(kmStatus(remainingKm), dayStatus(remainingDays)),
    baselineKm,
    baselineDate,
    baselineServiceId: visit?.id ?? null,
    dueKm,
    dueDate,
    remainingKm,
    remainingDays,
  };
}

/** Pure: one item per interval, worst status first, then by `remainingKm` ascending. */
export function computeDue(input: DueInput): DueItem[] {
  return input.intervals
    .map((interval) => dueItem(interval, input))
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.remainingKm - b.remainingKm);
}
