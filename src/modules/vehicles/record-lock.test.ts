import { describe, expect, it } from 'vitest';
import { ensureUnlocked, isLocked, LOCKED_RECORD } from './record-lock.ts';

const OWNED_SINCE = new Date('2026-05-01T00:00:00Z');

describe('isLocked', () => {
  it('is false when the vehicle was never transferred', () => {
    expect(isLocked(null, new Date('2020-01-01T00:00:00Z'))).toBe(false);
  });

  it('is true for a record created before the transfer', () => {
    expect(isLocked(OWNED_SINCE, new Date('2026-04-30T23:59:59Z'))).toBe(true);
  });

  it('is false for a record created at or after the transfer', () => {
    expect(isLocked(OWNED_SINCE, OWNED_SINCE)).toBe(false);
    expect(isLocked(OWNED_SINCE, new Date('2026-05-02T00:00:00Z'))).toBe(false);
  });
});

describe('ensureUnlocked', () => {
  it('throws 403 with the contract message for a locked record', () => {
    expect(() => ensureUnlocked(OWNED_SINCE, new Date('2026-01-01T00:00:00Z'))).toThrow(
      expect.objectContaining({ statusCode: 403, message: LOCKED_RECORD }),
    );
  });

  it('passes for an unlocked record', () => {
    expect(() => ensureUnlocked(OWNED_SINCE, OWNED_SINCE)).not.toThrow();
  });
});
