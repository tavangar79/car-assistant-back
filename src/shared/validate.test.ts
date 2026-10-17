import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { ValidationError } from './errors.ts';
import { parseOrThrow } from './validate.ts';

describe('parseOrThrow', () => {
  const schema = z.object({ name: z.string(), plate: z.object({ letter: z.string() }) });

  it('returns the parsed value', () => {
    expect(parseOrThrow(schema, { name: 'a', plate: { letter: 'b' } })).toEqual({
      name: 'a',
      plate: { letter: 'b' },
    });
  });

  it('keys details by the dotted field path', () => {
    try {
      parseOrThrow(schema, { name: 1, plate: { letter: 2 } });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect(Object.keys((err as ValidationError).details as object)).toEqual([
        'name',
        'plate.letter',
      ]);
    }
  });
});
