import 'dotenv/config';
import { z } from 'zod';

/** The value shipped in `.env.example`. Booting with it would make every JWT forgeable. */
export const JWT_SECRET_PLACEHOLDER = 'change-me-to-a-random-string-of-32-plus-chars';

function isOrigin(value: string): boolean {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1),
    // Number of reverse proxies in front of the API; needed for the per-IP rate limit to see the client IP.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    // Comma-separated browser origins allowed by CORS, e.g. https://app.example.com.
    // Outside production any http://localhost:<port> / http://127.0.0.1:<port> is allowed too.
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      )
      .pipe(
        z.array(
          z
            .string()
            .refine(
              isOrigin,
              'Each CORS_ORIGINS entry must be an origin like https://app.example.com',
            ),
        ),
      ),

    JWT_SECRET: z
      .string()
      .min(32, 'JWT_SECRET must be at least 32 characters')
      .refine((value) => value !== JWT_SECRET_PLACEHOLDER, {
        message: 'JWT_SECRET is still the .env.example placeholder; set a random secret',
      }),
    JWT_EXPIRES_IN: z
      .string()
      // A unit is required: jsonwebtoken reads a bare number string as milliseconds.
      .regex(/^\d+[smhdwy]$/, 'Use a duration with a unit, like 30d, 12h or 3600s')
      .default('30d'),

    SMS_PROVIDER: z.enum(['console', 'kavenegar']).default('console'),
    KAVENEGAR_API_KEY: z.string().default(''),
    KAVENEGAR_OTP_TEMPLATE: z.string().default(''),

    OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(5),
    // Opt-in for local dev/QA: every OTP is this code. Refused in production.
    OTP_FIXED_CODE: z.preprocess(
      emptyAsUndefined,
      z.string().regex(/^\d+$/, 'OTP_FIXED_CODE must be digits').optional(),
    ),
    // Set to false for local dev only: turns off the OTP cooldown, the per-phone cap and the per-IP limit.
    OTP_RATE_LIMIT_ENABLED: z
      .enum(['true', 'false'], { message: 'OTP_RATE_LIMIT_ENABLED must be true or false' })
      .default('true')
      .transform((value) => value === 'true'),
    OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(0).default(300),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    OTP_MAX_REQUESTS_PER_WINDOW: z.coerce.number().int().positive().default(5),
    OTP_REQUEST_WINDOW_SECONDS: z.coerce.number().int().positive().default(3600),

    AUTH_IP_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
    AUTH_IP_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  })
  .superRefine((env, ctx) => {
    const fail = (path: keyof typeof env, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    if (env.SMS_PROVIDER === 'kavenegar') {
      for (const key of ['KAVENEGAR_API_KEY', 'KAVENEGAR_OTP_TEMPLATE'] as const) {
        if (!env[key]) fail(key, 'Required when SMS_PROVIDER=kavenegar');
      }
    }
    if (env.OTP_FIXED_CODE !== undefined && env.OTP_FIXED_CODE.length !== env.OTP_LENGTH) {
      fail('OTP_FIXED_CODE', `OTP_FIXED_CODE must have OTP_LENGTH (${env.OTP_LENGTH}) digits`);
    }
    if (env.NODE_ENV === 'production') {
      if (env.OTP_FIXED_CODE !== undefined) {
        fail('OTP_FIXED_CODE', 'OTP_FIXED_CODE is not allowed in production');
      }
      if (env.SMS_PROVIDER === 'console') {
        fail('SMS_PROVIDER', 'SMS_PROVIDER=console is not allowed in production');
      }
    }
    if (env.OTP_REQUEST_WINDOW_SECONDS < env.OTP_RESEND_COOLDOWN_SECONDS) {
      fail(
        'OTP_REQUEST_WINDOW_SECONDS',
        'OTP_REQUEST_WINDOW_SECONDS must be at least OTP_RESEND_COOLDOWN_SECONDS',
      );
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment variables: ${result.error.message}`);
  }
  return result.data;
}
