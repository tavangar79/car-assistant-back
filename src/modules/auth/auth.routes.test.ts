import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { FakeSmsSender } from '../../test/fake-sms-sender.ts';
import { createTestDependencies, TEST_JWT_SECRET } from '../../test/test-dependencies.ts';
import { TokenService } from './token.service.ts';

const PHONE = '09121234567';

describe('/api/auth', () => {
  let sms: FakeSmsSender;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    sms = new FakeSmsSender();
    app = createApp(createTestDependencies({ smsSender: sms }));
  });

  async function signIn(): Promise<{ accessToken: string; user: { id: string } }> {
    await request(app).post('/api/auth/otp/request').send({ phone: PHONE }).expect(200);
    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone: PHONE, code: '12345' })
      .expect(200);
    return res.body;
  }

  describe('POST /otp/request', () => {
    it('returns 200 with the OTP timings and normalizes the phone', async () => {
      const res = await request(app)
        .post('/api/auth/otp/request')
        .send({ phone: '+989121234567' })
        .expect(200);

      expect(res.body).toEqual({
        expiresInSeconds: 120,
        resendInSeconds: 60,
        codeLength: 5,
        isRegistered: false,
      });
      expect(sms.sent[0]?.phone).toBe(PHONE);
    });

    it.each([{}, { phone: '12345' }, { phone: 9121234567 }])('returns 400 for %j', async (body) => {
      const res = await request(app).post('/api/auth/otp/request').send(body).expect(400);

      expect(res.body.error.message).toBe('Validation failed');
    });

    it('returns 429 with retryAfterSeconds, codeLength and Retry-After during the cooldown', async () => {
      await request(app).post('/api/auth/otp/request').send({ phone: PHONE }).expect(200);

      const res = await request(app)
        .post('/api/auth/otp/request')
        .send({ phone: PHONE })
        .expect(429);

      expect(res.body).toEqual({
        error: {
          message: 'Too many requests',
          details: { retryAfterSeconds: expect.any(Number), codeLength: 5 },
        },
      });
      expect(res.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
      expect(res.headers['retry-after']).toBe(String(res.body.error.details.retryAfterSeconds));
    });

    it('returns 429 with retryAfterSeconds, codeLength and Retry-After at the per-phone cap', async () => {
      const deps = createTestDependencies();
      app = createApp({
        ...deps,
        otpSettings: {
          ...deps.otpSettings,
          codeLength: 6,
          resendCooldownSeconds: 0,
          maxRequestsPerWindow: 1,
        },
      });
      await request(app).post('/api/auth/otp/request').send({ phone: PHONE }).expect(200);

      const res = await request(app)
        .post('/api/auth/otp/request')
        .send({ phone: PHONE })
        .expect(429);

      expect(res.body).toEqual({
        error: {
          message: 'Too many requests',
          details: { retryAfterSeconds: expect.any(Number), codeLength: 6 },
        },
      });
      expect(res.headers['retry-after']).toBe(String(res.body.error.details.retryAfterSeconds));
    });

    it('returns 502 when the SMS provider fails', async () => {
      sms.fail = true;

      const res = await request(app)
        .post('/api/auth/otp/request')
        .send({ phone: PHONE })
        .expect(502);

      expect(res.body).toEqual({ error: { message: 'SMS provider failed' } });
    });
  });

  describe('POST /otp/verify', () => {
    it('returns a token and the new user', async () => {
      await request(app).post('/api/auth/otp/request').send({ phone: PHONE });

      const res = await request(app)
        .post('/api/auth/otp/verify')
        .send({ phone: '۰۹۱۲۱۲۳۴۵۶۷', code: '۱۲۳۴۵' })
        .expect(200);

      expect(res.body).toEqual({
        accessToken: expect.any(String),
        isNewUser: true,
        user: {
          id: expect.stringMatching(/^[a-f\d]{24}$/),
          phone: PHONE,
          createdAt: expect.any(String),
        },
      });
      expect(new Date(res.body.user.createdAt).toISOString()).toBe(res.body.user.createdAt);
    });

    it('logs in an existing user with isNewUser=false', async () => {
      const deps = createTestDependencies();
      const existing = await deps.userRepository.create(PHONE);
      app = createApp(deps);

      const requested = await request(app)
        .post('/api/auth/otp/request')
        .send({ phone: PHONE })
        .expect(200);
      const res = await request(app)
        .post('/api/auth/otp/verify')
        .send({ phone: PHONE, code: '12345' })
        .expect(200);

      expect(requested.body.isRegistered).toBe(true);
      expect(res.body.isNewUser).toBe(false);
      expect(res.body.user.id).toBe(existing.id);
    });

    it('returns 401 for a wrong code', async () => {
      await request(app).post('/api/auth/otp/request').send({ phone: PHONE });

      const res = await request(app)
        .post('/api/auth/otp/verify')
        .send({ phone: PHONE, code: '99999' })
        .expect(401);

      expect(res.body).toEqual({ error: { message: 'Invalid or expired code' } });
    });

    it.each(['abc', '1234', '123456', '۱۲۳۴'])(
      'returns 400 for code %j (not 5 digits)',
      async (code) => {
        const res = await request(app)
          .post('/api/auth/otp/verify')
          .send({ phone: PHONE, code })
          .expect(400);

        expect(res.body.error.message).toBe('Validation failed');
      },
    );

    it('requires exactly the configured codeLength', async () => {
      const deps = createTestDependencies({ generateOtpCode: () => '123456' });
      app = createApp({ ...deps, otpSettings: { ...deps.otpSettings, codeLength: 6 } });

      const requested = await request(app).post('/api/auth/otp/request').send({ phone: PHONE });
      await request(app)
        .post('/api/auth/otp/verify')
        .send({ phone: PHONE, code: '12345' })
        .expect(400);
      await request(app)
        .post('/api/auth/otp/verify')
        .send({ phone: PHONE, code: '123456' })
        .expect(200);

      expect(requested.body.codeLength).toBe(6);
    });
  });

  describe('per-IP rate limit', () => {
    beforeEach(() => {
      app = createApp(createTestDependencies({ authIpRateLimit: { max: 2, windowSeconds: 900 } }));
    });

    it('returns 429 with codeLength and Retry-After once an IP exceeds the limit on /otp/request', async () => {
      await request(app).post('/api/auth/otp/request').send({ phone: '09120000001' }).expect(200);
      await request(app).post('/api/auth/otp/request').send({ phone: '09120000002' }).expect(200);

      const res = await request(app)
        .post('/api/auth/otp/request')
        .send({ phone: '09120000003' })
        .expect(429);

      expect(res.body).toEqual({
        error: {
          message: 'Too many requests',
          details: { retryAfterSeconds: expect.any(Number), codeLength: 5 },
        },
      });
      const { retryAfterSeconds } = res.body.error.details;
      expect(retryAfterSeconds).toBeGreaterThan(0);
      expect(retryAfterSeconds).toBeLessThanOrEqual(900);
      expect(res.headers['retry-after']).toBe(String(retryAfterSeconds));
    });

    it('limits /otp/verify too', async () => {
      for (let i = 0; i < 2; i++) {
        await request(app)
          .post('/api/auth/otp/verify')
          .send({ phone: PHONE, code: '99999' })
          .expect(401);
      }

      const res = await request(app)
        .post('/api/auth/otp/verify')
        .send({ phone: PHONE, code: '99999' })
        .expect(429);

      expect(res.body).toEqual({
        error: { message: 'Too many requests', details: { retryAfterSeconds: expect.any(Number) } },
      });
      expect(res.headers['retry-after']).toBe(String(res.body.error.details.retryAfterSeconds));
    });

    it('does not limit GET /me', async () => {
      for (let i = 0; i < 3; i++) await request(app).get('/api/auth/me').expect(401);
    });
  });

  describe('GET /me', () => {
    it('returns the current user with a valid token', async () => {
      const { accessToken, user } = await signIn();

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toEqual({ id: user.id, phone: PHONE, createdAt: expect.any(String) });
    });

    it('returns 401 without a token', async () => {
      const res = await request(app).get('/api/auth/me').expect(401);

      expect(res.body).toEqual({ error: { message: 'Unauthorized' } });
    });

    it('returns 401 with an invalid token', async () => {
      await request(app).get('/api/auth/me').set('Authorization', 'Bearer nope').expect(401);
    });

    it('returns 401 for a valid token of a user that does not exist', async () => {
      const token = new TokenService(TEST_JWT_SECRET, '30d').sign('000000000000000000000000');

      await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
    });
  });
});
