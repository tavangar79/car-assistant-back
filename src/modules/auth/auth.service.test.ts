import { beforeEach, describe, expect, it } from 'vitest';
import { FakeSmsSender } from '../../test/fake-sms-sender.ts';
import { JPEG_BYTES, PNG_BYTES } from '../../test/image-fixtures.ts';
import { InMemoryAvatarRepository } from '../../test/in-memory-avatar.repository.ts';
import { InMemoryOtpRepository } from '../../test/in-memory-otp.repository.ts';
import { InMemoryUserRepository } from '../../test/in-memory-user.repository.ts';
import { TEST_JWT_SECRET } from '../../test/test-dependencies.ts';
import { createOtpHasher } from './otp-code.ts';
import { AuthService } from './auth.service.ts';
import type { OtpSettings } from './auth.types.ts';
import { SmsProviderError } from './sms-sender.ts';
import { TokenService } from './token.service.ts';

const PHONE = '09121234567';
const CODE = '48213';
const PROFILE = {
  firstName: 'علی',
  lastName: 'محمدی',
  birthDate: new Date('1991-11-12T00:00:00Z'),
};

describe('AuthService', () => {
  let now: Date;
  let users: InMemoryUserRepository;
  let avatars: InMemoryAvatarRepository;
  let otps: InMemoryOtpRepository;
  let sms: FakeSmsSender;
  let tokens: TokenService;
  let service: AuthService;

  const advance = (seconds: number) => {
    now = new Date(now.getTime() + seconds * 1000);
  };

  const createService = (settings: Partial<OtpSettings> = {}) =>
    new AuthService({
      users,
      avatars,
      otps,
      sms,
      tokens,
      generateCode: () => CODE,
      hashCode: createOtpHasher(TEST_JWT_SECRET),
      now: () => now,
      settings: {
        codeLength: 5,
        ttlSeconds: 120,
        resendCooldownSeconds: 60,
        maxAttempts: 3,
        maxRequestsPerWindow: 3,
        requestWindowSeconds: 3600,
        rateLimitEnabled: true,
        ...settings,
      },
    });

  beforeEach(() => {
    now = new Date('2026-01-01T00:00:00Z');
    users = new InMemoryUserRepository();
    avatars = new InMemoryAvatarRepository();
    otps = new InMemoryOtpRepository();
    sms = new FakeSmsSender();
    tokens = new TokenService(TEST_JWT_SECRET, '30d');
    service = createService();
  });

  describe('requestOtp', () => {
    it('sends the code by SMS and stores only its HMAC', async () => {
      const result = await service.requestOtp(PHONE);

      expect(result).toEqual({
        expiresInSeconds: 120,
        resendInSeconds: 60,
        codeLength: 5,
        isRegistered: false,
      });
      expect(sms.sent).toEqual([{ phone: PHONE, code: CODE }]);
      const stored = otps.codes.get(PHONE);
      expect(stored?.codeHash).toBe(createOtpHasher(TEST_JWT_SECRET)(PHONE, CODE));
      expect(stored?.codeHash).not.toContain(CODE);
      expect(stored?.expiresAt).toEqual(new Date('2026-01-01T00:02:00Z'));
    });

    it('reports isRegistered for an existing user', async () => {
      await users.create(PHONE);

      expect((await service.requestOtp(PHONE)).isRegistered).toBe(true);
    });

    it('rejects a resend within the cooldown with retryAfterSeconds', async () => {
      await service.requestOtp(PHONE);
      advance(18);

      await expect(service.requestOtp(PHONE)).rejects.toMatchObject({
        statusCode: 429,
        message: 'Too many requests',
        details: { retryAfterSeconds: 42 },
      });
      expect(sms.sent).toHaveLength(1);
    });

    it('allows a resend after the cooldown and replaces the old code', async () => {
      await service.requestOtp(PHONE);
      await service.verifyOtp(PHONE, '00000').catch(() => undefined);
      advance(60);

      await service.requestOtp(PHONE);

      expect(sms.sent).toHaveLength(2);
      expect(otps.codes.get(PHONE)?.attempts).toBe(0);
    });

    it('propagates an SMS failure without storing a code or counting the request', async () => {
      sms.fail = true;

      await expect(service.requestOtp(PHONE)).rejects.toBeInstanceOf(SmsProviderError);
      expect(otps.codes.has(PHONE)).toBe(false);
      expect(otps.requests).toHaveLength(0);
    });

    it('caps requests per phone in the rolling window, so resends cannot reset attempts forever', async () => {
      for (let i = 0; i < 3; i++) {
        await service.requestOtp(PHONE);
        advance(60);
      }
      // Requests were at t=0, 60, 120; now t=180. The oldest leaves the window at t=3600.

      await expect(service.requestOtp(PHONE)).rejects.toMatchObject({
        statusCode: 429,
        details: { retryAfterSeconds: 3600 - 180 },
      });
      expect(sms.sent).toHaveLength(3);
    });

    it('allows a new request once the oldest one leaves the window', async () => {
      for (let i = 0; i < 3; i++) {
        await service.requestOtp(PHONE);
        advance(60);
      }
      advance(3600 - 180);

      await expect(service.requestOtp(PHONE)).resolves.toMatchObject({ codeLength: 5 });
    });

    it('caps each phone separately', async () => {
      for (let i = 0; i < 3; i++) {
        await service.requestOtp(PHONE);
        advance(60);
      }

      await expect(service.requestOtp('09129999999')).resolves.toBeDefined();
    });

    it('keeps the cooldown even after the previous code expired and was cleaned up', async () => {
      service = createService({ ttlSeconds: 30 });
      await service.requestOtp(PHONE);
      advance(40);

      await expect(service.requestOtp(PHONE)).rejects.toMatchObject({
        statusCode: 429,
        details: { retryAfterSeconds: 20 },
      });
    });

    it('skips the cooldown and window cap when rate limiting is disabled, but still logs requests', async () => {
      service = createService({ maxRequestsPerWindow: 1, rateLimitEnabled: false });

      await service.requestOtp(PHONE);
      await service.requestOtp(PHONE);

      expect(sms.sent).toHaveLength(2);
      expect(otps.requests).toHaveLength(2);
    });

    it('deletes expired codes and request logs older than the window', async () => {
      await otps.replace({
        phone: '09120000000',
        codeHash: 'ab',
        createdAt: new Date('2025-12-31T00:00:00Z'),
        expiresAt: new Date('2025-12-31T00:02:00Z'),
      });
      await otps.recordRequest('09120000000', new Date('2025-12-31T00:00:00Z'));

      await service.requestOtp(PHONE);

      expect(otps.codes.has('09120000000')).toBe(false);
      expect(otps.requests.map((r) => r.phone)).toEqual([PHONE]);
    });
  });

  describe('verifyOtp', () => {
    it('registers a new user on the first successful verify', async () => {
      await service.requestOtp(PHONE);

      const result = await service.verifyOtp(PHONE, CODE);

      expect(result.isNewUser).toBe(true);
      expect(result.user).toEqual({
        id: expect.any(String),
        phone: PHONE,
        createdAt: expect.any(Date),
        firstName: null,
        lastName: null,
        birthDate: null,
        isProfileComplete: false,
        avatarUrl: null,
      });
      expect(tokens.verify(result.accessToken)).toBe(result.user.id);
    });

    it('logs in an existing user', async () => {
      const existing = await users.create(PHONE);
      await service.requestOtp(PHONE);

      const result = await service.verifyOtp(PHONE, CODE);

      expect(result.isNewUser).toBe(false);
      expect(result.user.id).toBe(existing.id);
    });

    it('rejects a wrong code', async () => {
      await service.requestOtp(PHONE);

      await expect(service.verifyOtp(PHONE, '11111')).rejects.toMatchObject({
        statusCode: 401,
        message: 'Invalid or expired code',
      });
    });

    it('rejects when no code is pending', async () => {
      await expect(service.verifyOtp(PHONE, CODE)).rejects.toMatchObject({ statusCode: 401 });
    });

    it('rejects an expired code', async () => {
      await service.requestOtp(PHONE);
      advance(120);

      await expect(service.verifyOtp(PHONE, CODE)).rejects.toMatchObject({ statusCode: 401 });
    });

    it('rejects even the right code once attempts are exhausted', async () => {
      await service.requestOtp(PHONE);
      for (let i = 0; i < 3; i++) await service.verifyOtp(PHONE, '11111').catch(() => undefined);

      await expect(service.verifyOtp(PHONE, CODE)).rejects.toMatchObject({ statusCode: 401 });
    });

    it('accepts the right code on the last allowed attempt', async () => {
      await service.requestOtp(PHONE);
      for (let i = 0; i < 2; i++) await service.verifyOtp(PHONE, '11111').catch(() => undefined);

      await expect(service.verifyOtp(PHONE, CODE)).resolves.toMatchObject({ isNewUser: true });
    });

    it('accepts a code only once', async () => {
      await service.requestOtp(PHONE);
      await service.verifyOtp(PHONE, CODE);

      await expect(service.verifyOtp(PHONE, CODE)).rejects.toMatchObject({ statusCode: 401 });
    });

    it('resets the resend cooldown and window cap after a successful verify', async () => {
      for (let i = 0; i < 3; i++) {
        await service.requestOtp(PHONE);
        advance(60);
      }
      await service.verifyOtp(PHONE, CODE);

      await expect(service.requestOtp(PHONE)).resolves.toMatchObject({ isRegistered: true });
      expect(sms.sent).toHaveLength(4);
    });

    it('keeps the resend cooldown after a failed verify', async () => {
      await service.requestOtp(PHONE);
      await service.verifyOtp(PHONE, '11111').catch(() => undefined);

      await expect(service.requestOtp(PHONE)).rejects.toMatchObject({ statusCode: 429 });
    });

    it('keeps other phones request logs after a successful verify', async () => {
      await service.requestOtp(PHONE);
      await service.requestOtp('09120000000');
      await service.verifyOtp(PHONE, CODE);

      await expect(service.requestOtp('09120000000')).rejects.toMatchObject({ statusCode: 429 });
    });
  });

  describe('getProfile', () => {
    it('returns the public user', async () => {
      const user = await users.create(PHONE);

      expect(await service.getProfile(user.id)).toEqual({
        id: user.id,
        phone: PHONE,
        createdAt: user.createdAt,
        firstName: null,
        lastName: null,
        birthDate: null,
        isProfileComplete: false,
        avatarUrl: null,
      });
    });

    it('reports a complete profile with the birth date as YYYY-MM-DD', async () => {
      const user = await users.create(PHONE);
      await users.updateProfile(user.id, PROFILE);

      expect(await service.getProfile(user.id)).toMatchObject({
        firstName: 'علی',
        lastName: 'محمدی',
        birthDate: '1991-11-12',
        isProfileComplete: true,
        avatarUrl: null,
      });
    });

    it.each(['000000000000000000000000', 'not-an-object-id'])(
      'rejects unknown id %s with 404',
      async (id) => {
        await expect(service.getProfile(id)).rejects.toMatchObject({
          statusCode: 404,
          message: 'User not found',
        });
      },
    );
  });

  describe('updateProfile', () => {
    it('saves the profile and returns the complete public user', async () => {
      const user = await users.create(PHONE);

      const result = await service.updateProfile(user.id, PROFILE);

      expect(result).toEqual({
        id: user.id,
        phone: PHONE,
        createdAt: user.createdAt,
        firstName: 'علی',
        lastName: 'محمدی',
        birthDate: '1991-11-12',
        isProfileComplete: true,
        avatarUrl: null,
      });
      expect(await users.findById(user.id)).toMatchObject(PROFILE);
    });

    it.each(['000000000000000000000000', 'not-an-object-id'])(
      'rejects unknown id %s with 404',
      async (id) => {
        await expect(service.updateProfile(id, PROFILE)).rejects.toMatchObject({
          statusCode: 404,
          message: 'User not found',
        });
      },
    );
  });
  describe('avatar', () => {
    it('stores the upload with the type detected from its bytes and returns avatarUrl', async () => {
      const user = await users.create(PHONE);

      const result = await service.uploadAvatar(user.id, PNG_BYTES);

      const stored = avatars.avatars.get(user.id);
      expect(stored?.contentType).toBe('image/png');
      expect(result.avatarUrl).toBe(`/api/auth/me/avatar?v=${stored?.updatedAt.getTime()}`);
    });

    it('does not count the avatar towards isProfileComplete', async () => {
      const user = await users.create(PHONE);

      const result = await service.uploadAvatar(user.id, JPEG_BYTES);

      expect(result).toMatchObject({ avatarUrl: expect.any(String), isProfileComplete: false });
    });

    it('replaces an existing avatar', async () => {
      const user = await users.create(PHONE);
      await service.uploadAvatar(user.id, PNG_BYTES);

      await service.uploadAvatar(user.id, JPEG_BYTES);

      expect(avatars.avatars.size).toBe(1);
      expect((await service.getAvatar(user.id)).contentType).toBe('image/jpeg');
    });

    it('rejects bytes that are not JPEG, PNG or WebP with 400', async () => {
      const user = await users.create(PHONE);

      await expect(service.uploadAvatar(user.id, Buffer.from('<svg></svg>'))).rejects.toMatchObject(
        { statusCode: 400 },
      );
      expect(avatars.avatars.size).toBe(0);
    });

    it('includes avatarUrl in getProfile and verifyOtp', async () => {
      const user = await users.create(PHONE);
      await service.uploadAvatar(user.id, PNG_BYTES);
      await service.requestOtp(PHONE);

      const { user: verified } = await service.verifyOtp(PHONE, CODE);

      expect(verified.avatarUrl).toMatch(/^\/api\/auth\/me\/avatar\?v=\d+$/);
      expect((await service.getProfile(user.id)).avatarUrl).toBe(verified.avatarUrl);
    });

    it('returns 404 from getAvatar when there is none', async () => {
      const user = await users.create(PHONE);

      await expect(service.getAvatar(user.id)).rejects.toMatchObject({
        statusCode: 404,
        message: 'Avatar not found',
      });
    });

    it('deletes the avatar, and deleting again still succeeds', async () => {
      const user = await users.create(PHONE);
      await service.uploadAvatar(user.id, PNG_BYTES);

      expect((await service.deleteAvatar(user.id)).avatarUrl).toBeNull();
      expect((await service.deleteAvatar(user.id)).avatarUrl).toBeNull();
      expect(avatars.avatars.size).toBe(0);
    });

    it.each([
      ['uploadAvatar', (id: string) => service.uploadAvatar(id, PNG_BYTES)],
      ['getAvatar', (id: string) => service.getAvatar(id)],
      ['deleteAvatar', (id: string) => service.deleteAvatar(id)],
    ])('%s returns 404 for a user that does not exist', async (_name, call) => {
      await expect(call('000000000000000000000000')).rejects.toMatchObject({
        statusCode: 404,
        message: 'User not found',
      });
    });
  });
});
