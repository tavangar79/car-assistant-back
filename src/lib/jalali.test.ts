import { describe, expect, it } from 'vitest';
import { addJalaliMonths, jalaliMonthOf, jalaliMonthStart, jalaliYearStart } from './jalali.ts';

const at = (iso: string) => new Date(iso);

describe('jalali', () => {
  describe('jalaliMonthOf', () => {
    it('uses Tehran time, so 20:30 UTC is already the next day', () => {
      // 1 Farvardin 1403 is 2024-03-20; Tehran midnight is 2024-03-19T20:30Z.
      expect(jalaliMonthOf(at('2024-03-19T20:29:59.999Z'))).toEqual({ year: 1402, month: 12 });
      expect(jalaliMonthOf(at('2024-03-19T20:30:00.000Z'))).toEqual({ year: 1403, month: 1 });
    });
  });

  describe('jalaliYearStart', () => {
    it('turns at Nowruz in Tehran', () => {
      expect(jalaliYearStart(at('2024-03-19T20:30:00.000Z')).toISOString()).toBe(
        '2024-03-19T20:30:00.000Z',
      );
      expect(jalaliYearStart(at('2024-03-19T20:29:59.999Z')).toISOString()).toBe(
        '2023-03-20T20:30:00.000Z',
      );
    });

    it('covers mid-year dates', () => {
      expect(jalaliYearStart(at('2024-11-15T08:00:00.000Z')).toISOString()).toBe(
        '2024-03-19T20:30:00.000Z',
      );
    });
  });

  describe('jalaliMonthStart', () => {
    it('starts Khordad 1403 at Tehran midnight of 2024-05-21', () => {
      expect(jalaliMonthStart(at('2024-06-01T12:00:00.000Z')).toISOString()).toBe(
        '2024-05-20T20:30:00.000Z',
      );
    });

    it('handles the 30th of Esfand in leap year 1403', () => {
      // 30 Esfand 1403 is 2025-03-20; 1 Esfand 1403 is 2025-02-19.
      const esfand30 = at('2025-03-20T12:00:00.000Z');
      expect(jalaliMonthOf(esfand30)).toEqual({ year: 1403, month: 12 });
      expect(jalaliMonthStart(esfand30).toISOString()).toBe('2025-02-18T20:30:00.000Z');
      expect(jalaliYearStart(at('2025-03-20T20:30:00.000Z')).toISOString()).toBe(
        '2025-03-20T20:30:00.000Z',
      );
    });
  });

  describe('addJalaliMonths', () => {
    it('returns the start of the month n months later', () => {
      expect(addJalaliMonths(at('2024-06-01T12:00:00.000Z'), 1).toISOString()).toBe(
        '2024-06-20T20:30:00.000Z',
      );
    });

    it('crosses the year boundary in both directions', () => {
      const farvardin1404 = at('2025-04-01T12:00:00.000Z');
      expect(jalaliMonthOf(addJalaliMonths(farvardin1404, -1))).toEqual({
        year: 1403,
        month: 12,
      });
      expect(addJalaliMonths(farvardin1404, -1).toISOString()).toBe('2025-02-18T20:30:00.000Z');
      expect(jalaliMonthOf(addJalaliMonths(at('2025-03-01T12:00:00.000Z'), 1))).toEqual({
        year: 1404,
        month: 1,
      });
    });

    it('with 0 is the month start', () => {
      const date = at('2024-11-15T08:00:00.000Z');
      expect(addJalaliMonths(date, 0)).toEqual(jalaliMonthStart(date));
    });
  });
});
