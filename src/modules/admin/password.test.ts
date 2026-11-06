import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.ts';

describe('password hashing', () => {
  it('verifies the right password', async () => {
    const hash = await hashPassword('correct horse battery');

    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$[\w+/=]+\$[\w+/=]+$/);
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery');

    expect(await verifyPassword('correct horse batterz', hash)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same password!')).not.toBe(await hashPassword('same password!'));
  });

  it.each([
    '',
    'plain',
    'scrypt$1$2$3$abc',
    'bcrypt$16384$8$1$AAAA$AAAA',
    'scrypt$x$8$1$AAAA$AAAA',
  ])('returns false for the malformed stored hash %j', async (stored) => {
    expect(await verifyPassword('anything', stored)).toBe(false);
  });
});
