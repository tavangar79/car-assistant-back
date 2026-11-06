import { todayInProfileZone } from '../auth/auth.types.ts';
import type { StatBucket } from './admin.types.ts';

// Pure date bucketing for the admin stats. Dates are `YYYY-MM-DD` calendar days in Asia/Tehran;
// weeks start on Saturday, months on the 1st (Gregorian).

const DAY_MS = 86_400_000;
const SATURDAY = 6; // Date#getUTCDay()

const utcMidnight = (date: string) => new Date(`${date}T00:00:00Z`);

/** `date` plus `days` calendar days. */
export function addDays(date: string, days: number): string {
  return new Date(utcMidnight(date).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Calendar days from `from` to `to`, both included. */
export function daysInRange(from: string, to: string): number {
  return Math.round((utcMidnight(to).getTime() - utcMidnight(from).getTime()) / DAY_MS) + 1;
}

/** The Tehran calendar day of an instant. */
export function tehranDate(instant: Date): string {
  return todayInProfileZone(instant);
}

/** The first day of the bucket that contains `date`. */
export function bucketStart(date: string, bucket: StatBucket): string {
  if (bucket === 'month') return `${date.slice(0, 7)}-01`;
  if (bucket === 'week') {
    const daysSinceSaturday = (utcMidnight(date).getUTCDay() - SATURDAY + 7) % 7;
    return addDays(date, -daysSinceSaturday);
  }
  return date;
}

function nextBucket(start: string, bucket: StatBucket): string {
  if (bucket === 'day') return addDays(start, 1);
  if (bucket === 'week') return addDays(start, 7);
  const [year, month] = start.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

/** Every bucket that overlaps [from, to]. The first may start before `from`. */
export function bucketStarts(from: string, to: string, bucket: StatBucket): string[] {
  const starts: string[] = [];
  for (let start = bucketStart(from, bucket); start <= to; start = nextBucket(start, bucket)) {
    starts.push(start);
  }
  return starts;
}

export type SeriesPoint<M extends string> = { bucketStart: string } & Record<M, number>;

/**
 * A dense series: one point per bucket in [from, to], zeros included. Each metric counts the instants
 * whose Tehran day falls in the bucket; instants outside [from, to] are ignored.
 */
export function buildSeries<M extends string>(
  from: string,
  to: string,
  bucket: StatBucket,
  instants: Record<M, Date[]>,
): SeriesPoint<M>[] {
  const metrics = Object.keys(instants) as M[];
  const counts = new Map<string, Record<string, number>>();
  for (const start of bucketStarts(from, to, bucket)) {
    counts.set(start, Object.fromEntries(metrics.map((metric) => [metric, 0])));
  }
  for (const metric of metrics) {
    for (const instant of instants[metric]) {
      const day = tehranDate(instant);
      if (day < from || day > to) continue;
      counts.get(bucketStart(day, bucket))![metric]! += 1;
    }
  }
  return [...counts].map(
    ([start, values]) => ({ bucketStart: start, ...values }) as SeriesPoint<M>,
  );
}
