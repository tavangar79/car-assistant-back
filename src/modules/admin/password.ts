import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// Stored as `scrypt$N$r$p$<salt base64>$<hash base64>`, so the cost can be raised later
// without breaking existing hashes.

const COST = { N: 16384, r: 8, p: 1 };
const KEY_BYTES = 64;
const SALT_BYTES = 16;

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, COST);
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), key.toString('base64')].join(
    '$',
  );
}

/** Constant-time check. A malformed stored hash never matches. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const options = { N: Number(n), r: Number(r), p: Number(p) };
  if (!Object.values(options).every((value) => Number.isInteger(value) && value > 0)) return false;

  const expected = Buffer.from(hash, 'base64');
  if (expected.length !== KEY_BYTES) return false;
  try {
    return timingSafeEqual(await derive(password, Buffer.from(salt, 'base64'), options), expected);
  } catch {
    return false; // Invalid scrypt parameters.
  }
}
