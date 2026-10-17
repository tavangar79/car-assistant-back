import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { JPEG_BYTES, PNG_BYTES } from '../../test/image-fixtures.ts';
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

  async function signIn(): Promise<{
    accessToken: string;
    user: { id: string; avatarUrl: string | null };
  }> {
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

    it('returns 200 right after a successful verify (cooldown reset on sign-in)', async () => {
      await signIn();

      await request(app).post('/api/auth/otp/request').send({ phone: PHONE }).expect(200);
    });

    it('still returns 429 during the cooldown after a failed verify', async () => {
      await request(app).post('/api/auth/otp/request').send({ phone: PHONE }).expect(200);
      await request(app)
        .post('/api/auth/otp/verify')
        .send({ phone: PHONE, code: '00000' })
        .expect(401);

      await request(app).post('/api/auth/otp/request').send({ phone: PHONE }).expect(429);
    });

    it('skips the cooldown and the per-IP limit when rate limiting is disabled', async () => {
      const deps = createTestDependencies({ authIpRateLimit: { max: 1, windowSeconds: 900 } });
      app = createApp({ ...deps, otpSettings: { ...deps.otpSettings, rateLimitEnabled: false } });

      for (let i = 0; i < 3; i++) {
        await request(app).post('/api/auth/otp/request').send({ phone: PHONE }).expect(200);
      }
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
          firstName: null,
          lastName: null,
          birthDate: null,
          isProfileComplete: false,
          avatarUrl: null,
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

      expect(res.body).toEqual({
        id: user.id,
        phone: PHONE,
        createdAt: expect.any(String),
        firstName: null,
        lastName: null,
        birthDate: null,
        isProfileComplete: false,
        avatarUrl: null,
      });
    });

    it('returns 401 without a token', async () => {
      const res = await request(app).get('/api/auth/me').expect(401);

      expect(res.body).toEqual({ error: { message: 'Unauthorized' } });
    });

    it('returns 401 with an invalid token', async () => {
      await request(app).get('/api/auth/me').set('Authorization', 'Bearer nope').expect(401);
    });

    it.each(['000000000000000000000000', 'not-an-object-id'])(
      'returns 404 for a valid token whose user id %s does not exist',
      async (id) => {
        const token = new TokenService(TEST_JWT_SECRET, '30d').sign(id);

        const res = await request(app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${token}`)
          .expect(404);

        expect(res.body).toEqual({ error: { message: 'User not found' } });
      },
    );
  });

  describe('PUT /me', () => {
    const profile = { firstName: '  علی ', lastName: 'محمدی', birthDate: '1991-11-12' };

    beforeEach(() => {
      app = createApp(createTestDependencies({ now: () => new Date('2026-10-17T12:00:00Z') }));
    });

    it('saves the profile and returns the complete user', async () => {
      const { accessToken, user } = await signIn();

      const res = await request(app)
        .put('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(profile)
        .expect(200);

      expect(res.body).toEqual({
        id: user.id,
        phone: PHONE,
        createdAt: expect.any(String),
        firstName: 'علی',
        lastName: 'محمدی',
        birthDate: '1991-11-12',
        isProfileComplete: true,
        avatarUrl: null,
      });
      const me = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(me.body).toEqual(res.body);
    });

    it('accepts a birth date of today', async () => {
      const { accessToken } = await signIn();

      await request(app)
        .put('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...profile, birthDate: '2026-10-17' })
        .expect(200);
    });

    it.each([
      ['2026-10-16T21:00:00Z', '2026-10-17', 200],
      ['2026-10-16T21:00:00Z', '2026-10-18', 400],
      ['2026-10-16T20:00:00Z', '2026-10-17', 400],
    ])('at %s (Tehran time) birthDate %s returns %i', async (now, birthDate, status) => {
      app = createApp(createTestDependencies({ now: () => new Date(now) }));
      const { accessToken } = await signIn();

      await request(app)
        .put('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...profile, birthDate })
        .expect(status);
    });

    it.each([
      ['missing fields', {}],
      ['blank firstName', { ...profile, firstName: '   ' }],
      ['too long lastName', { ...profile, lastName: 'a'.repeat(51) }],
      ['non-string firstName', { ...profile, firstName: 42 }],
      ['malformed birthDate', { ...profile, birthDate: '1991/11/12' }],
      ['impossible birthDate', { ...profile, birthDate: '1991-02-30' }],
      ['birthDate before 1900', { ...profile, birthDate: '1899-12-31' }],
      ['birthDate in the future', { ...profile, birthDate: '2026-10-18' }],
    ])('returns 400 for %s', async (_case, body) => {
      const { accessToken } = await signIn();

      const res = await request(app)
        .put('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(body)
        .expect(400);

      expect(res.body.error).toEqual({ message: 'Validation failed', details: expect.any(Object) });
    });

    it('returns 401 without a token', async () => {
      const res = await request(app).put('/api/auth/me').send(profile).expect(401);

      expect(res.body).toEqual({ error: { message: 'Unauthorized' } });
    });

    it('returns 401 with an invalid token', async () => {
      await request(app)
        .put('/api/auth/me')
        .set('Authorization', 'Bearer nope')
        .send(profile)
        .expect(401);
    });

    it('returns 404 for a valid token of a user that does not exist', async () => {
      const token = new TokenService(TEST_JWT_SECRET, '30d').sign('000000000000000000000000');

      const res = await request(app)
        .put('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send(profile)
        .expect(404);

      expect(res.body).toEqual({ error: { message: 'User not found' } });
    });
  });
  describe('/me/avatar', () => {
    const AVATAR_URL = /^\/api\/auth\/me\/avatar\?v=\d+$/;
    let token: string;

    beforeEach(async () => {
      const deps = createTestDependencies();
      // No resend cooldown, so a test can sign in twice.
      app = createApp({ ...deps, otpSettings: { ...deps.otpSettings, resendCooldownSeconds: 0 } });
      token = (await signIn()).accessToken;
    });

    function upload(bytes: Buffer, contentType = 'image/png', field = 'avatar') {
      return request(app)
        .put('/api/auth/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach(field, bytes, { filename: 'photo', contentType });
    }

    function getAvatar() {
      return request(app)
        .get('/api/auth/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        });
    }

    describe('PUT', () => {
      it('stores the image and returns the user with avatarUrl', async () => {
        const res = await upload(PNG_BYTES).expect(200);

        expect(res.body).toMatchObject({
          phone: PHONE,
          avatarUrl: expect.stringMatching(AVATAR_URL),
          isProfileComplete: false,
        });
      });

      it('returns 400 without a file', async () => {
        const res = await request(app)
          .put('/api/auth/me/avatar')
          .set('Authorization', `Bearer ${token}`)
          .expect(400);

        expect(res.body).toEqual({
          error: { message: 'Validation failed', details: { avatar: ['Required'] } },
        });
      });

      it('returns 400 for a file under another field name', async () => {
        await upload(PNG_BYTES, 'image/png', 'photo').expect(400);
      });

      it('returns 400 for a disallowed declared type', async () => {
        const res = await upload(Buffer.from('GIF89a'), 'image/gif').expect(400);

        expect(res.body.error.details).toEqual({ avatar: ['Must be a JPEG, PNG or WebP image'] });
      });

      it('returns 400 for a forged image header whose bytes are not an image', async () => {
        const res = await upload(Buffer.from('<?php echo 1; ?>'), 'image/png').expect(400);

        expect(res.body.error.details).toEqual({ avatar: ['Must be a JPEG, PNG or WebP image'] });
      });

      it('returns 400 for a malformed multipart body', async () => {
        const res = await request(app)
          .put('/api/auth/me/avatar')
          .set('Authorization', `Bearer ${token}`)
          .set('Content-Type', 'multipart/form-data; boundary=xyz')
          // Part headers but no closing boundary.
          .send(
            [
              '--xyz',
              'Content-Disposition: form-data; name="avatar"; filename="a"',
              'Content-Type: image/png',
              '',
              'abc',
            ].join('\r\n'),
          )
          .expect(400);

        expect(res.body.error.details).toEqual({ avatar: ['Malformed multipart body'] });
      });

      it('returns 413 above 2 MB', async () => {
        const tooBig = Buffer.concat([PNG_BYTES, Buffer.alloc(2 * 1024 * 1024)]);

        const res = await upload(tooBig).expect(413);

        expect(res.body).toEqual({ error: { message: 'File too large' } });
      });

      it('returns 401 without a token', async () => {
        await request(app)
          .put('/api/auth/me/avatar')
          .attach('avatar', PNG_BYTES, { filename: 'photo', contentType: 'image/png' })
          .expect(401);
      });

      it('returns 404 for a valid token of a user that does not exist', async () => {
        token = new TokenService(TEST_JWT_SECRET, '30d').sign('000000000000000000000000');

        const res = await upload(PNG_BYTES).expect(404);

        expect(res.body).toEqual({ error: { message: 'User not found' } });
      });
    });

    describe('GET', () => {
      it('returns the raw bytes with the detected type and a long private cache', async () => {
        await upload(JPEG_BYTES, 'image/png').expect(200);

        const res = await getAvatar().expect(200);

        expect(res.headers['content-type']).toBe('image/jpeg');
        expect(res.headers['cache-control']).toBe('private, max-age=31536000');
        expect(Buffer.compare(res.body as Buffer, JPEG_BYTES)).toBe(0);
      });

      it('returns 404 when there is no avatar', async () => {
        const res = await request(app)
          .get('/api/auth/me/avatar')
          .set('Authorization', `Bearer ${token}`)
          .expect(404);

        expect(res.body).toEqual({ error: { message: 'Avatar not found' } });
      });

      it('returns 401 without a token', async () => {
        await request(app).get('/api/auth/me/avatar').expect(401);
      });
    });

    describe('DELETE', () => {
      it('removes the avatar and is idempotent', async () => {
        await upload(PNG_BYTES).expect(200);

        for (let i = 0; i < 2; i++) {
          const res = await request(app)
            .delete('/api/auth/me/avatar')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
          expect(res.body).toMatchObject({ phone: PHONE, avatarUrl: null });
        }
        await request(app)
          .get('/api/auth/me/avatar')
          .set('Authorization', `Bearer ${token}`)
          .expect(404);
      });

      it('returns 401 without a token', async () => {
        await request(app).delete('/api/auth/me/avatar').expect(401);
      });
    });

    it('exposes avatarUrl on GET /me and on the next verify', async () => {
      const uploaded = await upload(PNG_BYTES).expect(200);

      const me = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const verified = await signIn();

      expect(me.body.avatarUrl).toBe(uploaded.body.avatarUrl);
      expect(verified.user.avatarUrl).toBe(uploaded.body.avatarUrl);
    });
  });
});
