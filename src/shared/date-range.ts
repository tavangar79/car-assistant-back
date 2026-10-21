/** An inclusive date range; a missing bound is open. */
export interface DateRange {
  from?: Date;
  to?: Date;
}

export function inRange(date: Date, { from, to }: DateRange): boolean {
  return (!from || date >= from) && (!to || date <= to);
}
