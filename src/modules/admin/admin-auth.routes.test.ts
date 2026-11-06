import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { adminFixture, adminTokens, TEST_ADMIN_ID } from '../../test/admin-fixture.ts';
import { InMemoryAdminRepository } from '../../test/in-memory-admin.repository.ts';
import { ALICE_ID, createTestDependencies, TEST_JWT_SECRET } from '../../test/test-dependencies.ts';
import { TokenService } from '../auth/token.service.ts';
import { hashPassword } from './password.ts';
import { totpAt, totpStep } from './totp.ts';

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const PASSWORD = 'a-long-admin-password';
const NOW = new Date('2026-11-06T10:00:00Z');
const STEP = totpStep(NOW);
const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/);
const INVALID = { error: { message: 'Invalid credentials' } };

describe('/api/admin/auth', () => {
  let admins: InMemoryAdminRepository;
  let logs: string[];
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    admins = new InMemoryAdminRepository();
    await admins.replaceAll({
      username: 'root',
      passwordHash: await hashPassword(PASSWORD),
      totpSecret: SECRET,
    });
    logs = [];
    app = createApp(
      createTestDependencies({
        adminRepository: admins,
        adminLog: (line) => logs.push(line),
        now: () => NOW,
      }),
    );
  });

  const login = (body: object) => request(app).post('/api/admin/auth/login').send(body);
  const valid = (totp = totpAt(SECRET, STEP)) => ({ username: 'root', password: PASSWORD, totp });

  describe('POST /login', () => {
    it('returns an admin token, its expiry and the username', async () => {
      const res = await login(valid()).expect(200);

      expect(res.body).toEqual({
        accessToken: expect.any(String),
        expiresAt: ISO,
        admin: { username: 'root' },
      });
      const root = await admins.findByUsername('root');
      expect(adminTokens.verify(res.body.accessToken)).toBe(root!.id);
      expect(new Date(res.body.expiresAt).getTime() - Date.now()).toBeGreaterThan(9.9 * 86400_000);
    });

    it('accepts a code from the previous step', async () => {
      await login(valid(totpAt(SECRET, STEP - 1))).expect(200);
    });

    it.each([
      ['an unknown username', { ...valid(), username: 'nobody' }],
      ['a wrong password', { ...valid(), password: 'wrong-password-123' }],
      ['a wrong code', valid(totpAt(SECRET, STEP + 5))],
    ])('returns the generic 401 for %s', async (_name, body) => {
      const res = await login(body).expect(401);

      expect(res.body).toEqual(INVALID);
    });

    it('rejects a reused code (replay)', async () => {
      await login(valid()).expect(200);

      const res = await login(valid()).expect(401);

      expect(res.body).toEqual(INVALID);
    });

    it('rejects a code from a step before the last accepted one', async () => {
      await login(valid(totpAt(SECRET, STEP + 1))).expect(200);

      await login(valid(totpAt(SECRET, STEP))).expect(401);
    });

    it.each([
      {},
      { username: 'root', password: PASSWORD },
      { ...valid(), totp: '12345' },
      { ...valid(), totp: 123456 },
    ])('returns 400 for %j', async (body) => {
      const res = await login(body).expect(400);

      expect(res.body.error.message).toBe('Validation failed');
    });

    it('logs every attempt with the IP', async () => {
      await login(valid()).expect(200);
      await login({ ...valid(), password: 'wrong-password-123' }).expect(401);

      expect(logs).toEqual([
        expect.stringMatching(/^admin login ok username="root" ip=\S+$/),
        expect.stringMatching(/^admin login failed username="root" ip=\S+$/),
      ]);
    });

    it('allows 5 attempts per IP per window, then returns 429', async () => {
      app = createApp(
        createTestDependencies({
          adminRepository: admins,
          adminLoginRateLimit: { max: 5, windowSeconds: 900 },
        }),
      );
      for (let i = 0; i < 5; i++)
        await login({ ...valid(), password: 'wrong-password-123' }).expect(401);

      const res = await login(valid()).expect(429);

      expect(res.body.error.message).toBe('Too many requests');
      expect(res.headers['retry-after']).toBeDefined();
    });
  });

  describe('GET /me', () => {
    it('returns the admin', async () => {
      const { body } = await login(valid()).expect(200);

      await request(app)
        .get('/api/admin/auth/me')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200, { admin: { username: 'root' } });
    });

    it('returns 401 without a token', async () => {
      await request(app).get('/api/admin/auth/me').expect(401);
    });

    it('returns 401 once the admin row is gone (admin:setup ran again)', async () => {
      const { body } = await login(valid()).expect(200);
      await admins.replaceAll({ username: 'other', passwordHash: 'x', totpSecret: SECRET });

      await request(app)
        .get('/api/admin/auth/me')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(401);
    });
  });
});

describe('admin and user tokens are not interchangeable', () => {
  const { adminRepository, ADMIN } = adminFixture();
  const app = createApp(createTestDependencies({ adminRepository }));
  const USER = `Bearer ${new TokenService(TEST_JWT_SECRET, '30d').sign(ALICE_ID)}`;

  it('rejects a user token on an admin route with 401', async () => {
    await request(app).get('/api/admin/auth/me').set('Authorization', USER).expect(401);
    await request(app).get('/api/admin/users').set('Authorization', USER).expect(401);
  });

  it('rejects an admin token on a user route with 401', async () => {
    await request(app).get('/api/vehicles').set('Authorization', ADMIN).expect(401);
    await request(app).get('/api/auth/me').set('Authorization', ADMIN).expect(401);
  });

  it('rejects a token signed with the admin secret but no audience', async () => {
    const noAudience = new TokenService('test-admin-secret-test-admin-secret', '10d').sign(
      TEST_ADMIN_ID,
    );

    await request(app)
      .get('/api/admin/auth/me')
      .set('Authorization', `Bearer ${noAudience}`)
      .expect(401);
  });
});

describe('GET /api/admin/vehicle-catalog', () => {
  it('returns the same body as the user route', async () => {
    const { adminRepository, ADMIN } = adminFixture();
    const app = createApp(createTestDependencies({ adminRepository }));
    const USER = `Bearer ${new TokenService(TEST_JWT_SECRET, '30d').sign(ALICE_ID)}`;

    const user = await request(app)
      .get('/api/vehicle-catalog')
      .set('Authorization', USER)
      .expect(200);
    const admin = await request(app)
      .get('/api/admin/vehicle-catalog')
      .set('Authorization', ADMIN)
      .expect(200);

    expect(admin.body).toEqual(user.body);
  });

  it('returns 401 without an admin token', async () => {
    const app = createApp(createTestDependencies());

    await request(app).get('/api/admin/vehicle-catalog').expect(401);
  });
});
