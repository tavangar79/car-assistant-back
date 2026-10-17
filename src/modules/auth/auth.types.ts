import { z } from 'zod';
import { normalizeIranianPhone, toAsciiDigits } from './phone.ts';

const phoneSchema = z.string().transform((value, ctx) => {
  const phone = normalizeIranianPhone(value);
  if (!phone) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid Iranian mobile number' });
    return z.NEVER;
  }
  return phone;
});

export const requestOtpSchema = z.object({ phone: phoneSchema });

/** The code must have exactly `codeLength` digits (Persian/Arabic digits are accepted). */
export function createVerifyOtpSchema(codeLength: number) {
  return z.object({
    phone: phoneSchema,
    code: z
      .string()
      .transform((value) => toAsciiDigits(value.trim()))
      .pipe(
        z.string().regex(new RegExp(`^\\d{${codeLength}}$`), `Code must be ${codeLength} digits`),
      ),
  });
}

const nameSchema = z.string().trim().min(1).max(50);

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_BIRTH_YEAR = 1900;

/** Parses a real Gregorian `YYYY-MM-DD` date to UTC midnight, or returns null. */
export function parseIsoDate(value: string): Date | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return isRealDate ? date : null;
}

/** Birth dates are entered by users in Iran, so "today" is the calendar date there. */
export const PROFILE_TIME_ZONE = 'Asia/Tehran';

const todayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PROFILE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's `YYYY-MM-DD` in `PROFILE_TIME_ZONE` at instant `now`. */
export function todayInProfileZone(now: Date): string {
  return todayFormatter.format(now);
}

/** Formats a stored UTC-midnight date as `YYYY-MM-DD`. */
export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `birthDate` must be a real `YYYY-MM-DD` date from 1900 up to today in Tehran. */
export function createUpdateProfileSchema(now: () => Date) {
  return z.object({
    firstName: nameSchema,
    lastName: nameSchema,
    birthDate: z.string().transform((value, ctx) => {
      const date = parseIsoDate(value);
      if (!date) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must be a valid YYYY-MM-DD date' });
        return z.NEVER;
      }
      if (date.getUTCFullYear() < MIN_BIRTH_YEAR) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Year must be 1900 or later' });
        return z.NEVER;
      }
      if (value > todayInProfileZone(now())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must not be in the future' });
        return z.NEVER;
      }
      return date;
    }),
  });
}

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<ReturnType<typeof createVerifyOtpSchema>>;
export type UpdateProfileInput = z.infer<ReturnType<typeof createUpdateProfileSchema>>;

export interface User {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  /** UTC midnight of the Gregorian birth date. */
  birthDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OtpCode {
  phone: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  createdAt: Date;
}

export type NewOtpCode = Omit<OtpCode, 'attempts'>;

/** The user as exposed by the API. */
export interface PublicUser {
  id: string;
  phone: string;
  createdAt: Date;
  firstName: string | null;
  lastName: string | null;
  /** Gregorian `YYYY-MM-DD`. */
  birthDate: string | null;
  /** True once firstName, lastName and birthDate are all set. The avatar doesn't count. */
  isProfileComplete: boolean;
  /** `/api/auth/me/avatar?v=<updatedAt ms>`, or null without an avatar. */
  avatarUrl: string | null;
}

export interface UserAvatar {
  contentType: string;
  data: Uint8Array;
  updatedAt: Date;
}

export type NewUserAvatar = Omit<UserAvatar, 'updatedAt'>;

export interface RequestOtpResult {
  expiresInSeconds: number;
  resendInSeconds: number;
  codeLength: number;
  isRegistered: boolean;
}

export interface VerifyOtpResult {
  accessToken: string;
  isNewUser: boolean;
  user: PublicUser;
}

export interface OtpSettings {
  codeLength: number;
  ttlSeconds: number;
  resendCooldownSeconds: number;
  /** Wrong-code guesses allowed per sent code. */
  maxAttempts: number;
  /** Codes one phone may request per rolling window, so resends can't reset attempts forever. */
  maxRequestsPerWindow: number;
  requestWindowSeconds: number;
  /** False only in local dev: no cooldown, no per-phone cap, no per-IP limit. */
  rateLimitEnabled: boolean;
}
