import { describe, expect, it } from 'vitest';
import { InMemoryAdminRepository } from '../../test/in-memory-admin.repository.ts';
import { AdminSetupError, resetAdmin } from './admin-setup.ts';

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const PASSWORD = 'a-long-password';

function setup() {
  const admins = new InMemoryAdminRepository();
  const deps = {
    admins,
    hashPassword: async (password: string) => `hashed:${password}`,
    generateSecret: () => SECRET,
  };
  return { admins, deps };
}

describe('resetAdmin', () => {
  it('creates the admin with a hashed password and a new secret', async () => {
    const { admins, deps } = setup();

    const result = await resetAdmin(deps, {
      username: 'root',
      password: PASSWORD,
      confirmation: PASSWORD,
    });

    expect(result).toEqual({
      username: 'root',
      secret: SECRET,
      uri: `otpauth://totp/CarAssistant:root?secret=${SECRET}&issuer=CarAssistant&digits=6&period=30`,
    });
    expect(await admins.findByUsername('root')).toMatchObject({
      passwordHash: `hashed:${PASSWORD}`,
      totpSecret: SECRET,
      lastTotpStep: null,
    });
  });

  it('replaces every existing admin', async () => {
    const { admins, deps } = setup();
    await resetAdmin(deps, { username: 'old', password: PASSWORD, confirmation: PASSWORD });

    await resetAdmin(deps, { username: 'new', password: PASSWORD, confirmation: PASSWORD });

    expect(admins.count()).toBe(1);
    expect(await admins.findByUsername('old')).toBeNull();
    expect(await admins.findByUsername('new')).not.toBeNull();
  });

  it.each([
    [
      'a short password',
      { username: 'root', password: 'short-11chr', confirmation: 'short-11chr' },
    ],
    ['a mismatched confirmation', { username: 'root', password: PASSWORD, confirmation: 'other' }],
    ['an invalid username', { username: 'a b', password: PASSWORD, confirmation: PASSWORD }],
    ['a too short username', { username: 'ab', password: PASSWORD, confirmation: PASSWORD }],
  ])('rejects %s and keeps the existing admin', async (_name, input) => {
    const { admins, deps } = setup();
    await resetAdmin(deps, { username: 'keep', password: PASSWORD, confirmation: PASSWORD });

    await expect(resetAdmin(deps, input)).rejects.toBeInstanceOf(AdminSetupError);
    expect(await admins.findByUsername('keep')).not.toBeNull();
  });
});
