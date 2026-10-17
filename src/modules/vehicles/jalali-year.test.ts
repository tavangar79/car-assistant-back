import { describe, expect, it } from 'vitest';
import { jalaliYear } from './jalali-year.ts';

describe('jalaliYear', () => {
  it.each([
    ['2026-10-17T10:00:00Z', 1405],
    // Nowruz 1405 starts at 2026-03-21 00:00 Tehran (UTC+3:30).
    ['2026-03-20T20:29:00Z', 1404],
    ['2026-03-20T20:30:00Z', 1405],
  ])('%s is %i', (iso, year) => {
    expect(jalaliYear(new Date(iso))).toBe(year);
  });
});
