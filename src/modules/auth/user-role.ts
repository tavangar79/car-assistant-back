import type { UserRole } from './auth.types.ts';
import { normalizeIranianPhone } from './phone.ts';
import type { UserRepository } from './user.repository.ts';

/** Why a role change failed; the CLI prints `message` and exits with code 1. */
export class UserRoleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserRoleError';
  }
}

/** Sets the role of the user with this phone (normalized like login). Returns the normalized phone. */
export async function setUserRole(
  users: UserRepository,
  phoneInput: string,
  role: UserRole,
): Promise<string> {
  const phone = normalizeIranianPhone(phoneInput);
  if (!phone) throw new UserRoleError(`Not a valid mobile number: ${phoneInput}`);
  const user = await users.findByPhone(phone);
  if (!user) throw new UserRoleError(`No user with phone ${phone}`);
  await users.setRole(user.id, role);
  return phone;
}
