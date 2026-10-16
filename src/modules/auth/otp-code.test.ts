import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createCodeGenerator, createOtpHasher, otpHashesMatch } from './otp-code.ts';

describe('createCodeGenerator', () => {
  it('returns the fixed code only when one is configured', () => {
    expect(createCodeGenerator(5, '12345')()).toBe('12345');
  });

  it('returns random numeric codes of the configured length by default', () => {
    const generate = createCodeGenerator(5);
    const codes = new Set(Array.from({ length: 50 }, generate));

    for (const code of codes) expect(code).toMatch(/^\d{5}$/);
    expect(codes.size).toBeGreaterThan(1);
  });

  it('pads random codes with leading zeros', () => {
    const generate = createCodeGenerator(4);
    for (let i = 0; i < 100; i++) expect(generate()).toHaveLength(4);
  });
});

describe('createOtpHasher', () => {
  const hash = createOtpHasher('server-secret-server-secret-1234');

  it('matches the same phone and code only', () => {
    const stored = hash('09121234567', '12345');

    expect(stored).not.toContain('12345');
    expect(otpHashesMatch(stored, hash('09121234567', '12345'))).toBe(true);
    expect(otpHashesMatch(stored, hash('09121234567', '12346'))).toBe(false);
    expect(otpHashesMatch(stored, hash('09129999999', '12345'))).toBe(false);
  });

  it('is keyed: another secret gives another hash', () => {
    const other = createOtpHasher('another-secret-another-secret-12');

    expect(other('09121234567', '12345')).not.toBe(hash('09121234567', '12345'));
  });

  it('is not a plain sha256 of the phone and code', () => {
    const plain = createHash('sha256').update('09121234567:12345').digest('hex');

    expect(hash('09121234567', '12345')).not.toBe(plain);
  });
});
