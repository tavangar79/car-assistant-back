import { z } from 'zod';
import {
  createUpdateProfileSchema,
  formatIsoDate,
  parseIsoDate,
  type User,
} from '../auth/auth.types.ts';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a 24-character hex id');

// ---- Auth ----

export const adminLoginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
  totp: z.string().regex(/^\d{6}$/, 'Must be 6 digits'),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export interface AdminProfile {
  username: string;
}

export interface AdminLoginResult {
  accessToken: string;
  expiresAt: Date;
  admin: AdminProfile;
}

// ---- Paging ----

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** `?cursor=<id>&limit=<1..100>`: items sort by id, newest first; the cursor is the last id seen. */
export const pageQuerySchema = z.object({
  cursor: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Turns `limit + 1` fetched rows into a page: the extra row only says that there is a next page. */
export function toPage<T extends { id: string }>(rows: T[], limit: number): Page<T> {
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? items.at(-1)!.id : null };
}

// ---- Users ----

export const userListQuerySchema = pageQuerySchema.extend({
  search: z.string().max(100).optional(),
});

const PROFILE_KEYS = ['firstName', 'lastName', 'birthDate'] as const;

/** Any of firstName / lastName / birthDate, with the profile's field rules. Other keys are a 400. */
export function createAdminUpdateUserSchema(now: () => Date) {
  return createUpdateProfileSchema(now)
    .partial()
    .passthrough()
    .superRefine((body, ctx) => {
      for (const key of Object.keys(body)) {
        if (!(PROFILE_KEYS as readonly string[]).includes(key)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'Unknown field' });
        }
      }
      if (PROFILE_KEYS.every((key) => body[key] === undefined)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['body'],
          message: 'Send at least one of firstName, lastName, birthDate',
        });
      }
    })
    .transform(({ firstName, lastName, birthDate }) => ({ firstName, lastName, birthDate }));
}

export type AdminUpdateUserInput = Partial<z.infer<ReturnType<typeof createAdminUpdateUserSchema>>>;

export const blockUserSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => value || null),
});

/** A user as the admin panel shows it. */
export interface AdminUser {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  /** `YYYY-MM-DD`. */
  birthDate: string | null;
  blockedAt: Date | null;
  blockReason: string | null;
  createdAt: Date;
  vehicleCount: number;
}

export function toAdminUser(user: User, vehicleCount: number): AdminUser {
  return {
    id: user.id,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    birthDate: user.birthDate ? formatIsoDate(user.birthDate) : null,
    blockedAt: user.blockedAt ?? null,
    blockReason: user.blockReason ?? null,
    createdAt: user.createdAt,
    vehicleCount,
  };
}

// ---- Collections ----

export const collectionQuerySchema = pageQuerySchema.extend({
  userId: objectId.optional(),
  vehicleId: objectId.optional(),
});

// ---- Stats ----

export const STAT_BUCKETS = ['day', 'week', 'month'] as const;
export type StatBucket = (typeof STAT_BUCKETS)[number];

const isoDate = z
  .string()
  .refine((value) => parseIsoDate(value) !== null, 'Must be a valid YYYY-MM-DD date');

export const statsQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  bucket: z.enum(STAT_BUCKETS).default('day'),
});

export type StatsQuery = z.infer<typeof statsQuerySchema>;
