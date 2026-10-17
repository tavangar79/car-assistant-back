import {
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from '../../shared/errors.ts';
import {
  formatIsoDate,
  type UserAvatar,
  type OtpSettings,
  type PublicUser,
  type RequestOtpResult,
  type UpdateProfileInput,
  type User,
  type VerifyOtpResult,
} from './auth.types.ts';
import type { AvatarRepository } from './avatar.repository.ts';
import { detectImageType } from '../../shared/image-type.ts';
import type { OtpRepository } from './otp.repository.ts';
import { otpHashesMatch, type CodeGenerator, type OtpHasher } from './otp-code.ts';
import type { SmsSender } from './sms-sender.ts';
import type { TokenService } from './token.service.ts';
import type { UserRepository } from './user.repository.ts';

export interface AuthServiceDeps {
  users: UserRepository;
  avatars: AvatarRepository;
  otps: OtpRepository;
  sms: SmsSender;
  tokens: TokenService;
  generateCode: CodeGenerator;
  hashCode: OtpHasher;
  now: () => Date;
  settings: OtpSettings;
}

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const INVALID_CODE = 'Invalid or expired code';
const AVATAR_PATH = '/api/auth/me/avatar';

function toPublicUser(user: User, avatarUpdatedAt: Date | null): PublicUser {
  return {
    id: user.id,
    phone: user.phone,
    createdAt: user.createdAt,
    firstName: user.firstName,
    lastName: user.lastName,
    birthDate: user.birthDate ? formatIsoDate(user.birthDate) : null,
    isProfileComplete: Boolean(user.firstName && user.lastName && user.birthDate),
    avatarUrl: avatarUpdatedAt ? `${AVATAR_PATH}?v=${avatarUpdatedAt.getTime()}` : null,
  };
}

/** Phone + OTP sign-in. The first successful verify registers the user. */
export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  async requestOtp(phone: string): Promise<RequestOtpResult> {
    const { otps, users, sms, settings } = this.deps;
    const now = this.deps.now();
    const windowMs = settings.requestWindowSeconds * 1000;
    const windowStart = new Date(now.getTime() - windowMs);

    await otps.deleteExpired(now, windowStart);
    await this.ensureMayRequest(phone, now, windowStart);

    const code = this.deps.generateCode();
    await sms.sendOtp(phone, code); // Send first: a failed SMS must not start a cooldown.
    await otps.replace({
      phone,
      codeHash: this.deps.hashCode(phone, code),
      createdAt: now,
      expiresAt: new Date(now.getTime() + settings.ttlSeconds * 1000),
    });
    await otps.recordRequest(phone, now);

    return {
      expiresInSeconds: settings.ttlSeconds,
      resendInSeconds: settings.resendCooldownSeconds,
      codeLength: settings.codeLength,
      isRegistered: (await users.findByPhone(phone)) !== null,
    };
  }

  async verifyOtp(phone: string, code: string): Promise<VerifyOtpResult> {
    const { otps, users, tokens, settings } = this.deps;

    const otp = await otps.findByPhone(phone);
    if (!otp || otp.expiresAt.getTime() <= this.deps.now().getTime()) {
      throw new UnauthorizedError(INVALID_CODE);
    }
    if (!(await otps.useAttempt(phone, settings.maxAttempts))) {
      throw new UnauthorizedError(INVALID_CODE);
    }
    if (!otpHashesMatch(otp.codeHash, this.deps.hashCode(phone, code))) {
      throw new UnauthorizedError(INVALID_CODE);
    }
    if (!(await otps.consume(phone, otp.codeHash))) {
      throw new UnauthorizedError(INVALID_CODE); // Already used by a concurrent request.
    }
    await otps.clearRequests(phone); // Signed in: a later sign-in must not wait out the old cooldown.

    const existing = await users.findByPhone(phone);
    const user = existing ?? (await users.create(phone));
    return {
      accessToken: tokens.sign(user.id),
      isNewUser: !existing,
      user: await this.toPublic(user),
    };
  }

  /** 429 during the resend cooldown, or when the phone used up its requests for the window. */
  private async ensureMayRequest(phone: string, now: Date, windowStart: Date): Promise<void> {
    const { settings } = this.deps;
    if (!settings.rateLimitEnabled) return;
    const times = (await this.deps.otps.listRequestTimes(phone, windowStart)).map((t) =>
      t.getTime(),
    );
    const last = times.at(-1);
    const oldest = times[0];

    const blockedUntil = Math.max(
      last === undefined ? 0 : last + settings.resendCooldownSeconds * 1000,
      oldest === undefined || times.length < settings.maxRequestsPerWindow
        ? 0
        : oldest + settings.requestWindowSeconds * 1000,
    );
    if (blockedUntil > now.getTime()) {
      throw new TooManyRequestsError(Math.ceil((blockedUntil - now.getTime()) / 1000));
    }
  }

  async getProfile(userId: string): Promise<PublicUser> {
    return this.toPublic(await this.findUser(userId));
  }

  async updateProfile(userId: string, profile: UpdateProfileInput): Promise<PublicUser> {
    const user = await this.findUser(userId);
    return this.toPublic(await this.deps.users.updateProfile(user.id, profile));
  }

  /** Stores (or replaces) the avatar. The type comes from the magic bytes, not the client. */
  async uploadAvatar(userId: string, data: Uint8Array): Promise<PublicUser> {
    const user = await this.findUser(userId);
    const contentType = detectImageType(data);
    if (!contentType) {
      throw new ValidationError({ avatar: ['Must be a JPEG, PNG or WebP image'] });
    }
    const avatar = await this.deps.avatars.save(user.id, { contentType, data });
    return toPublicUser(user, avatar.updatedAt);
  }

  async getAvatar(userId: string): Promise<UserAvatar> {
    const user = await this.findUser(userId);
    const avatar = await this.deps.avatars.findByUserId(user.id);
    if (!avatar) throw new NotFoundError('Avatar');
    return avatar;
  }

  /** Idempotent: deleting a missing avatar still succeeds. */
  async deleteAvatar(userId: string): Promise<PublicUser> {
    const user = await this.findUser(userId);
    await this.deps.avatars.delete(user.id);
    return toPublicUser(user, null);
  }

  /** 404 for an unknown or malformed id (a valid token whose user was deleted). */
  private async findUser(userId: string): Promise<User> {
    const user = OBJECT_ID_PATTERN.test(userId) ? await this.deps.users.findById(userId) : null;
    if (!user) throw new NotFoundError('User');
    return user;
  }

  private async toPublic(user: User): Promise<PublicUser> {
    return toPublicUser(user, await this.deps.avatars.findUpdatedAt(user.id));
  }
}
