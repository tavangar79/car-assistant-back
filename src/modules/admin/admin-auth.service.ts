import { randomBytes } from 'node:crypto';
import { UnauthorizedError } from '../../shared/errors.ts';
import type { TokenService } from '../auth/token.service.ts';
import type { AdminRepository } from './admin.repository.ts';
import type { AdminProfile, AdminLoginInput, AdminLoginResult } from './admin.types.ts';
import { hashPassword, verifyPassword } from './password.ts';
import { verifyTotp } from './totp.ts';

export const INVALID_CREDENTIALS = 'Invalid credentials';
/** 5 login attempts per IP per 15 minutes. */
export const ADMIN_LOGIN_RATE_LIMIT = { max: 5, windowSeconds: 15 * 60 };
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export interface AdminAuthServiceDeps {
  admins: AdminRepository;
  /** Signs `aud: "admin"` tokens with ADMIN_JWT_SECRET. */
  tokens: TokenService;
  now: () => Date;
  /** One line per event (login attempts). */
  log: (line: string) => void;
}

/** Username + password + TOTP sign-in for the admin panel. */
export class AdminAuthService {
  /** Hashed once, on the first unknown username, so that case costs a scrypt like a real one. */
  private dummyHash: Promise<string> | null = null;

  constructor(private readonly deps: AdminAuthServiceDeps) {}

  /** Every failure is the same 401, so the response never says which factor was wrong. */
  async login(input: AdminLoginInput, ip: string): Promise<AdminLoginResult> {
    const admin = await this.check(input);
    this.deps.log(
      `admin login ${admin ? 'ok' : 'failed'} username=${JSON.stringify(input.username)} ip=${ip}`,
    );
    if (!admin) throw new UnauthorizedError(INVALID_CREDENTIALS);

    const { token, expiresAt } = this.deps.tokens.issue(admin.id);
    return { accessToken: token, expiresAt, admin: { username: admin.username } };
  }

  /** 401 when the admin row is gone (e.g. replaced by `admin:setup`). */
  async profile(adminId: string): Promise<AdminProfile> {
    return { username: (await this.findAdmin(adminId)).username };
  }

  /** The guard's lookup: the admin for a verified token subject, or 401. */
  async findAdmin(adminId: string): Promise<{ id: string; username: string }> {
    const admin = OBJECT_ID_PATTERN.test(adminId) ? await this.deps.admins.findById(adminId) : null;
    if (!admin) throw new UnauthorizedError();
    return admin;
  }

  private async check({ username, password, totp }: AdminLoginInput) {
    const { admins, now } = this.deps;
    const admin = await admins.findByUsername(username);
    if (!admin) {
      this.dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
      await verifyPassword(password, await this.dummyHash);
      return null;
    }
    if (!(await verifyPassword(password, admin.passwordHash))) return null;

    const step = verifyTotp(admin.totpSecret, totp, now());
    // acceptTotpStep refuses a step at or before the last accepted one (replay protection).
    if (step === null || !(await admins.acceptTotpStep(admin.id, step))) return null;
    return admin;
  }
}
