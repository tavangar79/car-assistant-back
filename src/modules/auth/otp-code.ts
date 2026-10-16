import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export type CodeGenerator = () => string;
export type OtpHasher = (phone: string, code: string) => string;

/**
 * Random numeric codes, unless `fixedCode` is set (explicit opt-in for local dev/QA;
 * `loadEnv` refuses it in production).
 */
export function createCodeGenerator(length: number, fixedCode?: string): CodeGenerator {
  if (fixedCode !== undefined) return () => fixedCode;
  return () => String(randomInt(0, 10 ** length)).padStart(length, '0');
}

/**
 * HMAC-SHA256 keyed by a server secret, so a leaked DB can't be brute-forced
 * (an OTP has only 10^4..10^8 values). The `otp-code:` prefix separates this use of
 * the key from JWT signing.
 */
export function createOtpHasher(secret: string): OtpHasher {
  return (phone, code) =>
    createHmac('sha256', secret).update(`otp-code:${phone}:${code}`).digest('hex');
}

export function otpHashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
