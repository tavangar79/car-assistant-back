import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  otpauthUri,
  totpAt,
  totpStep,
  verifyTotp,
} from './totp.ts';

// RFC 6238 appendix B, SHA-1: the ASCII secret "12345678901234567890", 8 digits.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));
const RFC_VECTORS: [number, string][] = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

const at = (seconds: number) => new Date(seconds * 1000);

describe('base32', () => {
  it('round-trips bytes (RFC 4648 alphabet, no padding)', () => {
    const bytes = Buffer.from('foobar', 'ascii');

    expect(base32Encode(bytes)).toBe('MZXW6YTBOI');
    expect(Buffer.from(base32Decode('MZXW6YTBOI')).toString('ascii')).toBe('foobar');
  });

  it('decodes lowercase, spaces and padding', () => {
    expect(Buffer.from(base32Decode('mzxw 6ytb oi======')).toString('ascii')).toBe('foobar');
  });

  it('rejects characters outside the alphabet', () => {
    expect(() => base32Decode('MZXW1')).toThrow();
  });
});

describe('totpAt', () => {
  it.each(RFC_VECTORS)('matches the RFC 6238 vector at %i s', (seconds, code) => {
    expect(totpAt(RFC_SECRET, totpStep(at(seconds)), 8)).toBe(code);
  });

  it('uses 6 digits by default (the last 6 of the RFC value)', () => {
    expect(totpAt(RFC_SECRET, totpStep(at(59)))).toBe('287082');
  });
});

describe('totpStep', () => {
  it('counts 30-second steps since the epoch', () => {
    expect(totpStep(at(0))).toBe(0);
    expect(totpStep(at(29))).toBe(0);
    expect(totpStep(at(30))).toBe(1);
  });
});

describe('verifyTotp', () => {
  const now = at(1111111111);
  const step = totpStep(now);
  const codeFor = (s: number) => totpAt(RFC_SECRET, s);

  it('returns the matching step for the current code', () => {
    expect(verifyTotp(RFC_SECRET, codeFor(step), now)).toBe(step);
  });

  it('accepts the previous and the next step (±1 window)', () => {
    expect(verifyTotp(RFC_SECRET, codeFor(step - 1), now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, codeFor(step + 1), now)).toBe(step + 1);
  });

  it('rejects codes two steps away', () => {
    expect(verifyTotp(RFC_SECRET, codeFor(step - 2), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, codeFor(step + 2), now)).toBeNull();
  });

  it('rejects a wrong or malformed code', () => {
    const valid = [step - 1, step, step + 1].map(codeFor);
    const wrong = ['000000', '111111', '222222'].find((code) => !valid.includes(code))!;

    expect(verifyTotp(RFC_SECRET, wrong, now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, '12345', now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef', now)).toBeNull();
  });
});

describe('generateTotpSecret', () => {
  it('returns 20 random bytes as base32 (32 characters)', () => {
    const secret = generateTotpSecret();

    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
    expect(generateTotpSecret()).not.toBe(secret);
  });
});

describe('otpauthUri', () => {
  it('builds the authenticator URI', () => {
    expect(otpauthUri('root', 'JBSWY3DPEHPK3PXP')).toBe(
      'otpauth://totp/CarAssistant:root?secret=JBSWY3DPEHPK3PXP&issuer=CarAssistant&digits=6&period=30',
    );
  });

  it('escapes the username', () => {
    expect(otpauthUri('a b', 'X')).toContain('CarAssistant:a%20b?');
  });
});
