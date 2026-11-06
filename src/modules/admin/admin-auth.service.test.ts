import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAdminRepository } from '../../test/in-memory-admin.repository.ts';
import { TokenService } from '../auth/token.service.ts';
import { AdminAuthService, INVALID_CREDENTIALS } from './admin-auth.service.ts';
import { hashPassword } from './password.ts';
import { totpAt, totpStep } from './totp.ts';

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const PASSWORD = 'a-long-admin-password';
const NOW = new Date('2026-11-06T10:00:00Z');
const tokens = new TokenService('s'.repeat(32), '10d', 'admin');

describe('AdminAuthService', () => {
  let admins: InMemoryAdminRepository;
  let logs: string[];
  let service: AdminAuthService;

  beforeEach(async () => {
    admins = new InMemoryAdminRepository();
    await admins.replaceAll({
      username: 'root',
      passwordHash: await hashPassword(PASSWORD),
      totpSecret: SECRET,
    });
    logs = [];
    service = new AdminAuthService({
      admins,
      tokens,
      now: () => NOW,
      log: (line) => logs.push(line),
    });
  });

  const code = totpAt(SECRET, totpStep(NOW));

  it('logs in and stores the accepted step', async () => {
    const result = await service.login(
      { username: 'root', password: PASSWORD, totp: code },
      '1.2.3.4',
    );

    const root = (await admins.findByUsername('root'))!;
    expect(tokens.verify(result.accessToken)).toBe(root.id);
    expect(result.admin).toEqual({ username: 'root' });
    expect(root.lastTotpStep).toBe(totpStep(NOW));
    expect(logs).toEqual(['admin login ok username="root" ip=1.2.3.4']);
  });

  it('does not store a step when the password is wrong', async () => {
    await expect(
      service.login({ username: 'root', password: 'nope-nope-nope', totp: code }, '1.2.3.4'),
    ).rejects.toMatchObject({ statusCode: 401, message: INVALID_CREDENTIALS });

    expect((await admins.findByUsername('root'))!.lastTotpStep).toBeNull();
    expect(logs).toEqual(['admin login failed username="root" ip=1.2.3.4']);
  });

  it('returns the profile, and 401 for an unknown or malformed id', async () => {
    const root = (await admins.findByUsername('root'))!;

    expect(await service.profile(root.id)).toEqual({ username: 'root' });
    await expect(service.profile('ffffffffffffffffffffffff')).rejects.toMatchObject({
      statusCode: 401,
    });
    await expect(service.profile('nope')).rejects.toMatchObject({ statusCode: 401 });
  });
});
