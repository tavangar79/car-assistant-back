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

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<ReturnType<typeof createVerifyOtpSchema>>;

export interface User {
  id: string;
  phone: string;
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
}

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
}
