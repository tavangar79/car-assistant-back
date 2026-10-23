import { z } from 'zod';
import {
  commaList,
  fromNotAfterTo,
  HISTORY_ENTRY_TYPES,
  isoDate,
  type HistoryEntry,
  type HistoryEntryType,
  type HistorySummary,
} from '../history/history.types.ts';

const isEntryType = (value: string): value is HistoryEntryType =>
  (HISTORY_ENTRY_TYPES as readonly string[]).includes(value);

/** `service,fuel` → `['service', 'fuel']`. Unlike history filters, an empty list is invalid. */
const entryTypes = z.string().transform((value, ctx) => {
  const list = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (list.length === 0 || !list.every(isEntryType)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Must be a comma-separated list of: ${HISTORY_ENTRY_TYPES.join(', ')}`,
    });
    return z.NEVER;
  }
  return [...new Set(list.filter(isEntryType))];
});

// Query strings only: every value arrives as a string.
export const reportQuerySchema = z
  .object({
    /** Ownership (and malformed ids) are checked by the service: 404, not 400. */
    vehicleIds: commaList.optional(),
    /** Absent = all three. */
    types: entryTypes.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .superRefine(fromNotAfterTo);

export type ReportQuery = z.infer<typeof reportQuerySchema>;

/** Every matching history entry, oldest first, with the same summary as history. */
export interface Report {
  entries: HistoryEntry[];
  summary: HistorySummary;
}
