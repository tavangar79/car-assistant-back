import { z } from 'zod';
import type { Expense } from '../expenses/expense.types.ts';
import type { FuelLog } from '../fuel-logs/fuel-log.types.ts';
import type { ServiceVisit } from '../service-visits/service-visit.types.ts';

export const HISTORY_ENTRY_TYPES = ['service', 'fuel', 'expense'] as const;
export type HistoryEntryType = (typeof HISTORY_ENTRY_TYPES)[number];
export const HISTORY_TYPES = ['all', ...HISTORY_ENTRY_TYPES] as const;
export type HistoryTypeFilter = (typeof HISTORY_TYPES)[number];

/** The 6 service-item catalog categories, plus `legal` for every expense that isn't `other`. */
export const HISTORY_CATEGORIES = [
  'fluids',
  'brakes',
  'suspension',
  'electrical',
  'drivetrain',
  'periodic',
  'legal',
] as const;
export type HistoryCategory = (typeof HISTORY_CATEGORIES)[number];

export const HISTORY_DEFAULT_LIMIT = 30;
export const HISTORY_MAX_LIMIT = 100;

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

/** Where a page ends: the last entry's date and id. */
export interface HistoryCursor {
  occurredAt: Date;
  id: string;
}

/** base64url of `<occurredAt ISO>_<id>`. */
export function encodeCursor({ occurredAt, id }: HistoryCursor): string {
  return Buffer.from(`${occurredAt.toISOString()}_${id}`).toString('base64url');
}

/** Null for anything `encodeCursor` could not have produced. */
export function decodeCursor(cursor: string): HistoryCursor | null {
  const [iso, id, ...rest] = Buffer.from(cursor, 'base64url').toString('utf8').split('_');
  const occurredAt = new Date(iso ?? '');
  if (rest.length > 0 || !id || !OBJECT_ID_PATTERN.test(id) || Number.isNaN(occurredAt.getTime())) {
    return null;
  }
  return occurredAt.toISOString() === iso ? { occurredAt, id } : null;
}

/** `a,b,,c` → `['a', 'b', 'c']`; an empty list counts as absent. */
export const commaList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  )
  .transform((list) => (list.length > 0 ? list : undefined));

const isCategory = (value: string): value is HistoryCategory =>
  (HISTORY_CATEGORIES as readonly string[]).includes(value);

export const isoDate = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

/** `from > to` → 400 `details.from`. */
export function fromNotAfterTo(query: { from?: Date; to?: Date }, ctx: z.RefinementCtx): void {
  if (query.from && query.to && query.from > query.to) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['from'], message: 'Must not be after to' });
  }
}

// Query strings only: every value arrives as a string.
export const historyQuerySchema = z
  .object({
    /** Ownership (and malformed ids) are checked by the service: 404, not 400. */
    vehicleIds: commaList.optional(),
    type: z.enum(HISTORY_TYPES).default('all'),
    categories: commaList
      .refine((list) => !list || list.every(isCategory), {
        message: `Each must be one of: ${HISTORY_CATEGORIES.join(', ')}`,
      })
      .transform((list) => list?.filter(isCategory))
      .optional(),
    hasAttachment: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    cursor: z
      .string()
      .transform((value, ctx) => {
        const cursor = decodeCursor(value);
        if (!cursor) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid cursor' });
        return cursor ?? z.NEVER;
      })
      .optional(),
    limit: z.coerce.number().int().min(1).max(HISTORY_MAX_LIMIT).default(HISTORY_DEFAULT_LIMIT),
  })
  .superRefine(fromNotAfterTo);

export type HistoryQuery = z.infer<typeof historyQuerySchema>;

/** One service visit, fuel log or expense. Exactly one of the three payloads is set, matching `type`. */
export interface HistoryEntry {
  type: HistoryEntryType;
  id: string;
  vehicleId: string;
  /** `serviceDate` / `fueledAt` / `paidAt`. */
  occurredAt: Date;
  /** Toman: a visit's `totalCost`, a log's `totalCost`, an expense's `amount`. */
  cost: number;
  /** A visit's invoice or an expense's attachment; always false for fuel. */
  hasAttachment: boolean;
  service: ServiceVisit | null;
  fuelLog: FuelLog | null;
  expense: Expense | null;
}

/** Totals over the whole filtered set, not just the page. */
export interface HistorySummary {
  totalCost: number;
  serviceCount: number;
  /** Litres of every non-cng log, rounded to 1 decimal. */
  fuelVolume: number;
  entryCount: number;
}

export interface HistoryPage {
  entries: HistoryEntry[];
  nextCursor: string | null;
  /** Only on the first page (no cursor); null afterwards. */
  summary: HistorySummary | null;
}
