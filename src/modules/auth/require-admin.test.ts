import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../shared/error-handler.ts';
import { InMemoryUserRepository } from '../../test/in-memory-user.repository.ts';
import { TEST_JWT_SECRET } from '../../test/test-dependencies.ts';
import { ADMIN_ONLY, requireAdmin } from './require-admin.ts';
import { requireAuth } from './require-auth.ts';
import { TokenService } from './token.service.ts';

const tokens = new TokenService(TEST_JWT_SECRET, '30d');

async function appWithUsers() {
  const users = new InMemoryUserRepository();
  const app = express();
  app.get('/x', requireAuth(tokens), requireAdmin(users), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return { app, users };
}

describe('requireAdmin', () => {
  it('lets an admin through', async () => {
    const { app, users } = await appWithUsers();
    const admin = await users.create('09120000001');
    await users.setRole(admin.id, 'admin');

    await request(app)
      .get('/x')
      .set('Authorization', `Bearer ${tokens.sign(admin.id)}`)
      .expect(200, { ok: true });
  });

  it('returns 403 for a normal user', async () => {
    const { app, users } = await appWithUsers();
    const user = await users.create('09120000002');

    const res = await request(app)
      .get('/x')
      .set('Authorization', `Bearer ${tokens.sign(user.id)}`)
      .expect(403);
    expect(res.body).toEqual({ error: { message: ADMIN_ONLY } });
  });

  it('returns 403 for a token of a user that no longer exists', async () => {
    const { app } = await appWithUsers();

    await request(app)
      .get('/x')
      .set('Authorization', `Bearer ${tokens.sign('aaaaaaaaaaaaaaaaaaaaaaaa')}`)
      .expect(403);
  });
});
