import type { AdminRepository } from './admin.repository.ts';
import { otpauthUri } from './totp.ts';

export const MIN_PASSWORD_LENGTH = 12;
const USERNAME = /^[A-Za-z0-9._-]{3,32}$/;

/** Why setup failed; the CLI prints `message` and exits with code 1. */
export class AdminSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminSetupError';
  }
}

export interface ResetAdminDeps {
  admins: AdminRepository;
  hashPassword: (password: string) => Promise<string>;
  generateSecret: () => string;
}

export interface ResetAdminInput {
  username: string;
  password: string;
  /** The password typed a second time. */
  confirmation: string;
}

export interface ResetAdminResult {
  username: string;
  /** Base32 TOTP secret, to type into an authenticator app. */
  secret: string;
  /** The `otpauth://` URI, shown as a QR code. */
  uri: string;
}

/** `npm run admin:setup`: replaces every admin with one new admin and a new TOTP secret. */
export async function resetAdmin(
  { admins, hashPassword, generateSecret }: ResetAdminDeps,
  { username, password, confirmation }: ResetAdminInput,
): Promise<ResetAdminResult> {
  if (!USERNAME.test(username)) {
    throw new AdminSetupError('Username must be 3-32 characters: letters, digits, . _ -');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AdminSetupError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (password !== confirmation) throw new AdminSetupError('Passwords do not match');

  const secret = generateSecret();
  await admins.replaceAll({
    username,
    passwordHash: await hashPassword(password),
    totpSecret: secret,
  });
  return { username, secret, uri: otpauthUri(username, secret) };
}
