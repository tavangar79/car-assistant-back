import { ValidationError } from '../../shared/errors.ts';
import type { UserRepository } from '../auth/user.repository.ts';
import type { StatBucket, StatsQuery } from './admin.types.ts';
import type { CollectionName } from './collection-browser.ts';
import type { CollectionRepository } from './collection.repository.ts';
import {
  addDays,
  buildSeries,
  daysInRange,
  tehranDate,
  type SeriesPoint,
} from './stats-buckets.ts';

export const DEFAULT_RANGE_DAYS = 30;
export const MAX_RANGE_DAYS = 366;

/** Each counted metric and its collection. Every one has `@@index([createdAt])`. */
const METRICS = {
  users: 'users',
  vehicles: 'vehicles',
  serviceVisits: 'service_visits',
  fuelLogs: 'fuel_logs',
  expenses: 'expenses',
  odometerReadings: 'odometer_readings',
  documents: 'vehicle_documents',
} as const satisfies Record<string, CollectionName>;

type Metric = keyof typeof METRICS;

export interface AdminStats {
  range: { from: string; to: string; bucket: StatBucket };
  totals: Record<Metric | 'blockedUsers', number>;
  series: SeriesPoint<Metric>[];
}

export interface AdminStatsServiceDeps {
  collections: CollectionRepository;
  users: UserRepository;
  now: () => Date;
}

const metrics = Object.keys(METRICS) as Metric[];

/** Counts by `createdAt` in Tehran days. Deleted rows are not counted, so past numbers can drop. */
export class AdminStatsService {
  constructor(private readonly deps: AdminStatsServiceDeps) {}

  async stats(query: StatsQuery): Promise<AdminStats> {
    const { collections, users } = this.deps;
    const to = query.to ?? tehranDate(this.deps.now());
    const from = query.from ?? addDays(to, -(DEFAULT_RANGE_DAYS - 1));
    if (from > to) throw new ValidationError({ from: ['Must be on or before to'] });
    if (daysInRange(from, to) > MAX_RANGE_DAYS) {
      throw new ValidationError({ from: [`The range is at most ${MAX_RANGE_DAYS} days`] });
    }

    // A UTC window a day wider than the Tehran days; buildSeries drops what falls outside them.
    const start = new Date(`${addDays(from, -1)}T00:00:00Z`);
    const end = new Date(`${addDays(to, 1)}T00:00:00Z`);
    const [counts, blockedUsers, instants] = await Promise.all([
      Promise.all(metrics.map((metric) => collections.count(METRICS[metric]))),
      users.countBlocked(),
      Promise.all(metrics.map((metric) => collections.listCreatedAt(METRICS[metric], start, end))),
    ]);

    const byMetric = <T>(values: T[]) =>
      Object.fromEntries(metrics.map((metric, i) => [metric, values[i]!])) as Record<Metric, T>;
    const { users: userTotal, ...recordTotals } = byMetric(counts);
    return {
      range: { from, to, bucket: query.bucket },
      totals: { users: userTotal, blockedUsers, ...recordTotals },
      series: buildSeries(from, to, query.bucket, byMetric(instants)),
    };
  }
}
