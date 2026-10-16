import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import { TEST_JWT_SECRET } from '../../test/test-dependencies.ts';
import { UnauthorizedError } from '../../shared/errors.ts';
import { authUserId, requireAuth } from './require-auth.ts';
import { TokenService } from './token.service.ts';

const USER_ID = '65f000000000000000000001';
const tokens = new TokenService(TEST_JWT_SECRET, '30d');
const guard = requireAuth(tokens);

function run(authorization?: string) {
  const req = { headers: authorization === undefined ? {} : { authorization } } as Request;
  const res = { locals: {} } as Response;
  const next = vi.fn();
  return { res, next, call: () => guard(req, res, next) };
}

describe('requireAuth', () => {
  it('accepts a valid Bearer token and exposes the user id', () => {
    const { res, next, call } = run(`Bearer ${tokens.sign(USER_ID)}`);

    call();

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
  ])('rejects %s with 401', (_name, authorization) => {
    const { res, next, call } = run(authorization);

    expect(call).toThrow(UnauthorizedError);
    expect(next).not.toHaveBeenCalled();
    expect(res.locals.userId).toBeUndefined();
  });
});

describe('authUserId', () => {
  it('throws 401 when the guard did not run', () => {
    expect(() => authUserId({ locals: {} } as Response)).toThrow(UnauthorizedError);
  });
});
