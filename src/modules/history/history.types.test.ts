import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './history.types.ts';

const b64 = (text: string) => Buffer.from(text).toString('base64url');

describe('history cursor', () => {
  it('round-trips a date and an id as base64url of "<iso>_<id>"', () => {
    const cursor = { occurredAt: new Date('2024-11-15T08:00:00.000Z'), id: '6650'.padEnd(24, 'a') };
    const encoded = encodeCursor(cursor);
    expect(Buffer.from(encoded, 'base64url').toString()).toBe(
      `2024-11-15T08:00:00.000Z_${cursor.id}`,
    );
    expect(decodeCursor(encoded)).toEqual(cursor);
  });

  it.each([
    ['garbage', 'not-a-cursor'],
    ['no id', b64('2024-11-15T08:00:00.000Z')],
    ['bad id', b64('2024-11-15T08:00:00.000Z_xyz')],
    ['bad date', b64(`yesterday_${'a'.repeat(24)}`)],
    ['non-canonical date', b64(`2024-11-15_${'a'.repeat(24)}`)],
    ['extra part', b64(`2024-11-15T08:00:00.000Z_${'a'.repeat(24)}_x`)],
  ])('rejects %s', (_name, cursor) => {
    expect(decodeCursor(cursor)).toBeNull();
  });
});
