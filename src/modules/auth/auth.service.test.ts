import { beforeEach, describe, expect, it } from 'vitest';
import { FakeSmsSender } from '../../test/fake-sms-sender.ts';
import { InMemoryOtpRepository } from '../../test/in-memory-otp.repository.ts';
import { InMemoryUserRepository } from '../../test/in-memory-user.repository.ts';
import { TEST_JWT_SECRET } from '../../test/test-dependencies.ts';
import { createOtpHasher } from './otp-code.ts';
import { AuthService } from './auth.service.ts';
import { SmsProviderError } from './sms-sender.ts';
import { TokenService } from './token.service.ts';

const PHONE = '09121234567';
const CODE = '48213';

describe('AuthService', () => {
  let now: Date;
  let users: InMemoryUserRepository;
  let otps: InMemoryOtpRepository;
  let sms: FakeSmsSender;
  let tokens: TokenService;
  let service: AuthService;

  const advance = (seconds: number) => {
    now = new Date(now.getTime() + seconds * 1000);
  };

  beforeEach(() => {
    now = new Date('2026-01-01T00:00:00Z');
    users = new InMemoryUserRepository();
    otps = new InMemoryOtpRepository();
    sms = new FakeSmsSender();
    tokens = new TokenService(TEST_JWT_SECRET, '30d');
    service = new AuthService({
      users,
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
      },
    });
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
      service = new AuthService({
        users,
        otps,
        sms,
        tokens,
        generateCode: () => CODE,
        hashCode: createOtpHasher(TEST_JWT_SECRET),
        now: () => now,
        settings: {
          codeLength: 5,
          ttlSeconds: 30,
          resendCooldownSeconds: 60,
          maxAttempts: 3,
          maxRequestsPerWindow: 3,
          requestWindowSeconds: 3600,
        },
      });
      await service.requestOtp(PHONE);
      advance(40);

      await expect(service.requestOtp(PHONE)).rejects.toMatchObject({
        statusCode: 429,
        details: { retryAfterSeconds: 20 },
      });
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
  });

  describe('getProfile', () => {
    it('returns the public user', async () => {
      const user = await users.create(PHONE);

      expect(await service.getProfile(user.id)).toEqual({
        id: user.id,
        phone: PHONE,
        createdAt: user.createdAt,
      });
    });

    it.each(['000000000000000000000000', 'not-an-object-id'])(
      'rejects unknown id %s with 401',
      async (id) => {
        await expect(service.getProfile(id)).rejects.toMatchObject({
          statusCode: 401,
          message: 'Unauthorized',
        });
      },
    );
  });
});
