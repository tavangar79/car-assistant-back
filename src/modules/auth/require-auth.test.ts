import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryUserRepository } from '../../test/in-memory-user.repository.ts';
import { TEST_JWT_SECRET } from '../../test/test-dependencies.ts';
import { UnauthorizedError, UserBlockedError } from '../../shared/errors.ts';
import { authUserId, requireAuth } from './require-auth.ts';
import { TokenService } from './token.service.ts';

const USER_ID = '65f000000000000000000001';
const BLOCKED_ID = '65f000000000000000000002';
const tokens = new TokenService(TEST_JWT_SECRET, '30d');
const users = new InMemoryUserRepository([
  { id: USER_ID, phone: '09120000001' },
  { id: BLOCKED_ID, phone: '09120000002', blockedAt: new Date(), blockReason: 'spam' },
]);
const guard = requireAuth(tokens, users);

function run(authorization?: string) {
  const req = { headers: authorization === undefined ? {} : { authorization } } as Request;
  const res = { locals: {} } as Response;
  const next = vi.fn();
  return { res, next, call: async () => guard(req, res, next) };
}

describe('requireAuth', () => {
  it('accepts a valid Bearer token and exposes the user id', async () => {
    const { res, next, call } = run(`Bearer ${tokens.sign(USER_ID)}`);

    await call();

    expect(next).toHaveBeenCalledOnce();
    expect(authUserId(res)).toBe(USER_ID);
  });

  it.each([
    ['a missing header', undefined],
    ['a Basic scheme', 'Basic dXNlcjpwYXNz'],
    ['a malformed header', 'Bearer'],
    ['a token with spaces', 'Bearer a b'],
    ['a non-JWT token', 'Bearer not-a-jwt'],
    [
      'an expired token',
      `Bearer ${jwt.sign({ sub: USER_ID, exp: Math.floor(Date.now() / 1000) - 10 }, TEST_JWT_SECRET)}`,
    ],
    [
      'a token signed with another secret',
      `Bearer ${new TokenService('x'.repeat(32), '30d').sign(USER_ID)}`,
    ],
    [
      'an admin-audience token',
      `Bearer ${new TokenService(TEST_JWT_SECRET, '30d', 'admin').sign(USER_ID)}`,
    ],
    ['a token of a deleted user', `Bearer ${tokens.sign('65f0000000000000000000ff')}`],
    ['a token with a malformed id', `Bearer ${tokens.sign('not-an-id')}`],
  ])('rejects %s with 401', async (_name, authorization) => {
    const { res, next, call } = run(authorization);

    await expect(call()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(next).not.toHaveBeenCalled();
    expect(res.locals.userId).toBeUndefined();
  });

  it('rejects a blocked user with 403 user_blocked', async () => {
    const { next, call } = run(`Bearer ${tokens.sign(BLOCKED_ID)}`);

    const error = await call().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UserBlockedError);
    expect(error).toMatchObject({ statusCode: 403, details: { code: 'user_blocked' } });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('authUserId', () => {
  it('throws 401 when the guard did not run', () => {
    expect(() => authUserId({ locals: {} } as Response)).toThrow(UnauthorizedError);
  });
});
