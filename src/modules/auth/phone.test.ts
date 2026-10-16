import { describe, expect, it } from 'vitest';
import { normalizeIranianPhone, toAsciiDigits } from './phone.ts';

describe('normalizeIranianPhone', () => {
  it.each([
    '09121234567',
    '+989121234567',
    '989121234567',
    '00989121234567',
    '۰۹۱۲۱۲۳۴۵۶۷',
    '٠٩١٢١٢٣٤٥٦٧',
    '+۹۸۹۱۲۱۲۳۴۵۶۷',
    ' 0912 123 4567 ',
    '0912-123-4567',
  ])('normalizes %s to 09121234567', (input) => {
    expect(normalizeIranianPhone(input)).toBe('09121234567');
  });

  it.each(['', '9121234567', '0912123456', '091212345678', '02112345678', '+19121234567', 'abc'])(
    'rejects %j',
    (input) => {
      expect(normalizeIranianPhone(input)).toBeNull();
    },
  );
});

describe('toAsciiDigits', () => {
  it('converts Persian and Arabic digits', () => {
    expect(toAsciiDigits('۱۲۳٤٥6')).toBe('123456');
  });
});
