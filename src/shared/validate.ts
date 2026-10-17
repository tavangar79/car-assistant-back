import type { z } from 'zod';
import { ValidationError } from './errors.ts';

/** Zod issues as `{ "field.path": [messages] }`, e.g. `{ "plate.letter": ["Invalid letter"] }`. */
function detailsByPath(error: z.ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.');
    if (key) (details[key] ??= []).push(issue.message);
  }
  return details;
}

export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(detailsByPath(result.error));
  }
  return result.data;
}
