import type { DueItem } from '../service-intervals/compute-due.ts';
import type { PlannedNotification } from './notification.types.ts';

const DAY_MS = 86_400_000;

/** Reminders fire this many days before an expiry; only the current threshold is created. */
export const EXPIRY_THRESHOLDS_DAYS = [7, 15, 30] as const;

/** Snapshot subjects when an expense has no title. */
export const EXPENSE_CATEGORY_TITLES: Record<string, string> = {
  third_party_insurance: 'بیمه شخص ثالث',
  body_insurance: 'بیمه بدنه',
  fine: 'جریمه',
  toll: 'عوارض',
  inspection: 'معاینه فنی',
  other: 'سایر',
};

/** Snapshot subjects when a document has no title. */
export const DOCUMENT_TYPE_TITLES: Record<string, string> = {
  third_party_insurance: 'بیمه شخص ثالث',
  body_insurance: 'بیمه بدنه',
  inspection: 'معاینه فنی',
  vehicle_card: 'کارت خودرو',
  green_sheet: 'برگ سبز (سند مالکیت)',
  power_of_attorney: 'وکالت‌نامه',
};

export interface VehicleDue {
  vehicleId: string;
  mileageKm: number;
  /** From the existing due computation (`computeDue`). */
  items: DueItem[];
}

/** What the planner needs from an expense or a document. */
export interface ExpiringRecord {
  id: string;
  vehicleId: string;
  title: string | null;
  expiresAt: Date | null;
  expiryReminder: boolean;
}

export interface PlanInput {
  now: Date;
  vehicles: VehicleDue[];
  expenses: (ExpiringRecord & { category: string })[];
  documents: (ExpiringRecord & { type: string })[];
}

/**
 * The reminder threshold (30 | 15 | 7) that applies `now`, or null when the expiry is more than
 * 30 days away or already past. `daysLeft = ceil((expiresAt − now) / 1 day)`.
 */
export function expiryThreshold(expiresAt: Date, now: Date): number | null {
  const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS);
  if (daysLeft <= 0) return null;
  return EXPIRY_THRESHOLDS_DAYS.find((threshold) => threshold >= daysLeft) ?? null;
}

function intervalNotifications({ vehicleId, mileageKm, items }: VehicleDue): PlannedNotification[] {
  return items
    .filter((item) => item.status === 'due_soon' || item.status === 'overdue')
    .map((item) => ({
      // A new covering service moves the baseline, so the next cycle notifies again.
      key: `interval:${vehicleId}:${item.intervalId}:${item.baselineDate.toISOString()}:${item.status}`,
      kind: item.status === 'overdue' ? 'interval_overdue' : 'interval_due_soon',
      vehicleId,
      refId: item.intervalId,
      subject: item.title,
      dueKm: item.dueKm,
      remainingKm: item.remainingKm,
      mileageKm,
      expiresAt: item.dueDate,
      thresholdDays: null,
    }));
}

function expiryNotification(
  source: 'expense' | 'document',
  record: ExpiringRecord,
  fallbackSubject: string,
  now: Date,
): PlannedNotification | null {
  if (!record.expiryReminder || !record.expiresAt) return null;
  const thresholdDays = expiryThreshold(record.expiresAt, now);
  if (thresholdDays === null) return null;
  return {
    key: `${source}:${record.id}:${record.expiresAt.toISOString()}:${thresholdDays}`,
    kind: source === 'expense' ? 'expense_expiry' : 'document_expiry',
    vehicleId: record.vehicleId,
    refId: record.id,
    subject: record.title ?? fallbackSubject,
    dueKm: null,
    remainingKm: null,
    mileageKm: null,
    expiresAt: record.expiresAt,
    thresholdDays,
  };
}

/** Pure: every notification that should exist `now`. The caller inserts the ones whose key is new. */
export function planNotifications({
  now,
  vehicles,
  expenses,
  documents,
}: PlanInput): PlannedNotification[] {
  const expiring = [
    ...expenses.map((expense) =>
      expiryNotification('expense', expense, EXPENSE_CATEGORY_TITLES[expense.category] ?? '', now),
    ),
    ...documents.map((document) =>
      expiryNotification('document', document, DOCUMENT_TYPE_TITLES[document.type] ?? '', now),
    ),
  ];
  return [
    ...vehicles.flatMap(intervalNotifications),
    ...expiring.filter((notification) => notification !== null),
  ];
}
