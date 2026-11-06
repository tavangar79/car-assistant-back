import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { TokenService } from './token.service.ts';

const SECRET = 'test-secret-test-secret-test-secret';

describe('TokenService', () => {
  const tokens = new TokenService(SECRET, '30d');

  it('round-trips the user id', () => {
    expect(tokens.verify(tokens.sign('65f000000000000000000001'))).toBe('65f000000000000000000001');
  });

  it('rejects a token signed with another secret', () => {
    const other = new TokenService('another-secret-another-secret-xx', '30d');

    expect(tokens.verify(other.sign('65f000000000000000000001'))).toBeNull();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ sub: 'u1', exp: Math.floor(Date.now() / 1000) - 10 }, SECRET);

    expect(tokens.verify(expired)).toBeNull();
  });

  it('rejects garbage', () => {
    expect(tokens.verify('not-a-jwt')).toBeNull();
  });

  it('issue reports the expiry', () => {
    const { token, expiresAt } = new TokenService(SECRET, '10d').issue('u1');

    const { exp } = jwt.decode(token) as { exp: number };
    expect(expiresAt.getTime()).toBe(exp * 1000);
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(10 * 86400_000 - 5000);
  });

  it('rejects a token that carries an audience', () => {
    const admin = new TokenService(SECRET, '30d', 'admin');

    expect(tokens.verify(admin.sign('u1'))).toBeNull();
  });
});

describe('TokenService with an audience', () => {
  const admin = new TokenService(SECRET, '10d', 'admin');

  it('signs aud and round-trips the subject', () => {
    const token = admin.sign('a1');

    expect(jwt.decode(token)).toMatchObject({ aud: 'admin', sub: 'a1' });
    expect(admin.verify(token)).toBe('a1');
  });

  it('rejects a token without the audience', () => {
    expect(admin.verify(new TokenService(SECRET, '30d').sign('u1'))).toBeNull();
  });

  it('rejects a token for another audience', () => {
    expect(admin.verify(new TokenService(SECRET, '30d', 'other').sign('u1'))).toBeNull();
  });
});
