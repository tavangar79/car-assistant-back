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
});
