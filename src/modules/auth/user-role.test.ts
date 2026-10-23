import { describe, expect, it } from 'vitest';
import { InMemoryUserRepository } from '../../test/in-memory-user.repository.ts';
import { setUserRole, UserRoleError } from './user-role.ts';

describe('setUserRole', () => {
  it('grants and revokes admin for a phone in any accepted format', async () => {
    const users = new InMemoryUserRepository();
    const user = await users.create('09121234567');

    expect(await setUserRole(users, '+98 912 123 4567', 'admin')).toBe('09121234567');
    expect((await users.findById(user.id))?.role).toBe('admin');

    await setUserRole(users, '۰۹۱۲۱۲۳۴۵۶۷', 'user');
    expect((await users.findById(user.id))?.role).toBe('user');
  });

  it('rejects an unknown phone', async () => {
    const users = new InMemoryUserRepository();

    await expect(setUserRole(users, '09120000000', 'admin')).rejects.toThrow(
      new UserRoleError('No user with phone 09120000000'),
    );
  });

  it('rejects an invalid phone', async () => {
    await expect(setUserRole(new InMemoryUserRepository(), 'abc', 'admin')).rejects.toBeInstanceOf(
      UserRoleError,
    );
  });
});
