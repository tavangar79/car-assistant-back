import { TooManyRequestsError, UnauthorizedError } from '../../shared/errors.ts';
import type {
  OtpSettings,
  PublicUser,
  RequestOtpResult,
  User,
  VerifyOtpResult,
} from './auth.types.ts';
import type { OtpRepository } from './otp.repository.ts';
import { otpHashesMatch, type CodeGenerator, type OtpHasher } from './otp-code.ts';
import type { SmsSender } from './sms-sender.ts';
import type { TokenService } from './token.service.ts';
import type { UserRepository } from './user.repository.ts';

export interface AuthServiceDeps {
  users: UserRepository;
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

function toPublicUser(user: User): PublicUser {
  return { id: user.id, phone: user.phone, createdAt: user.createdAt };
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

    const existing = await users.findByPhone(phone);
    const user = existing ?? (await users.create(phone));
    return { accessToken: tokens.sign(user.id), isNewUser: !existing, user: toPublicUser(user) };
  }

  /** 429 during the resend cooldown, or when the phone used up its requests for the window. */
  private async ensureMayRequest(phone: string, now: Date, windowStart: Date): Promise<void> {
    const { settings } = this.deps;
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
    const user = OBJECT_ID_PATTERN.test(userId) ? await this.deps.users.findById(userId) : null;
    if (!user) throw new UnauthorizedError();
    return toPublicUser(user);
  }
}
