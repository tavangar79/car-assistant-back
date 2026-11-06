import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// TOTP per RFC 6238: HMAC-SHA-1, 30-second steps, 6 digits (what Google Authenticator expects).

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;
/** Steps accepted on each side of the current one, for clock drift. */
const WINDOW = 1;
const SECRET_BYTES = 20;
const ISSUER = 'CarAssistant';

/** RFC 4648 base32, without padding. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Accepts lowercase, spaces and `=` padding. Throws on any other character. */
export function base32Decode(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error(`Invalid base32 character: ${char}`);
    value = ((value << 5) | index) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

/** The 30-second step that contains `now`. */
export function totpStep(now: Date): number {
  return Math.floor(now.getTime() / 1000 / STEP_SECONDS);
}

/** The code for one step (RFC 4226 HOTP with the step as the counter). */
export function totpAt(secretBase32: string, step: number, digits = DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secretBase32)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/**
 * Checks a 6-digit code against the steps around `now` and returns the matching step, or null.
 * The caller must still reject a step it has already accepted (replay protection).
 */
export function verifyTotp(secretBase32: string, code: string, now: Date): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = totpStep(now);
  let matched: number | null = null;
  // Check every step (no early exit), so the timing doesn't depend on which one matched.
  for (let step = current - WINDOW; step <= current + WINDOW; step++) {
    if (timingSafeEqual(Buffer.from(totpAt(secretBase32, step)), Buffer.from(code))) matched = step;
  }
  return matched;
}

/** A new random secret: 20 bytes, base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES));
}

/** The `otpauth://` URI that authenticator apps scan. */
export function otpauthUri(username: string, secretBase32: string): string {
  const label = `${ISSUER}:${encodeURIComponent(username)}`;
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${ISSUER}&digits=${DIGITS}&period=${STEP_SECONDS}`;
}
