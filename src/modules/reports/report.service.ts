import { AppError } from '../../shared/errors.ts';
import { summarize, type HistoryService } from '../history/history.service.ts';
import { HISTORY_ENTRY_TYPES, type HistoryEntry } from '../history/history.types.ts';
import type { Report, ReportQuery } from './report.types.ts';

export const REPORT_MAX_ENTRIES = 5000;
export const REPORT_TOO_LARGE = 'بازه گزارش بیش از حد بزرگ است';

export interface ReportServiceDeps {
  /** Ownership checks, the entries and their summary all come from history. */
  history: HistoryService;
  /** More matching entries than this → 422. */
  maxEntries: number;
}

/** `occurredAt` asc, then `id` asc: a report reads oldest → newest. */
const oldestFirst = (a: HistoryEntry, b: HistoryEntry) =>
  a.occurredAt.getTime() - b.occurredAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The data of an exported report (the client builds the CSV/PDF). */
export class ReportService {
  constructor(private readonly deps: ReportServiceDeps) {}

  /** Another user's (or a malformed) vehicle id is "not found". */
  async get(userId: string, query: ReportQuery): Promise<Report> {
    const { history, maxEntries } = this.deps;
    const vehicles = await history.ownedVehicles(userId, query.vehicleIds);
    const types = new Set(query.types ?? HISTORY_ENTRY_TYPES);
    const entries = (await history.entriesOf(vehicles, { from: query.from, to: query.to }))
      .filter((entry) => types.has(entry.type))
      .sort(oldestFirst);
    if (entries.length > maxEntries) throw new AppError(422, REPORT_TOO_LARGE);
    return { entries, summary: summarize(entries) };
  }
}
