import { toGregorian, toJalaali } from 'jalaali-js';

// Iran has had no DST since 2022, so Tehran is always UTC+03:30.
const TEHRAN_OFFSET_MS = (3 * 60 + 30) * 60_000;

export interface JalaliMonth {
  year: number;
  /** 1 = Farvardin … 12 = Esfand. */
  month: number;
}

/** The Jalali year and month at instant `date` in Tehran. */
export function jalaliMonthOf(date: Date): JalaliMonth {
  const tehran = new Date(date.getTime() + TEHRAN_OFFSET_MS);
  const { jy, jm } = toJalaali(
    tehran.getUTCFullYear(),
    tehran.getUTCMonth() + 1,
    tehran.getUTCDate(),
  );
  return { year: jy, month: jm };
}

/** Midnight in Tehran on day 1 of the Jalali month, as a UTC instant. */
function startOf({ year, month }: JalaliMonth): Date {
  const { gy, gm, gd } = toGregorian(year, month, 1);
  return new Date(Date.UTC(gy, gm - 1, gd) - TEHRAN_OFFSET_MS);
}

/** The start of the Jalali month that contains `date`. */
export function jalaliMonthStart(date: Date): Date {
  return startOf(jalaliMonthOf(date));
}

/** The start of the Jalali year (Nowruz) that contains `date`. */
export function jalaliYearStart(date: Date): Date {
  return startOf({ year: jalaliMonthOf(date).year, month: 1 });
}

/** The start of the Jalali month `months` after (or before, when negative) the month that contains `date`. */
export function addJalaliMonths(date: Date, months: number): Date {
  const { year, month } = jalaliMonthOf(date);
  const index = year * 12 + (month - 1) + months;
  return startOf({ year: Math.floor(index / 12), month: (index % 12) + 1 });
}
