import jwt, { type SignOptions } from 'jsonwebtoken';

/** Issues and checks access tokens (HS256 JWT, `sub` = user id). */
export class TokenService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string,
  ) {}

  sign(userId: string): string {
    return jwt.sign({}, this.secret, {
      algorithm: 'HS256',
      subject: userId,
      expiresIn: this.expiresIn as SignOptions['expiresIn'],
    });
  }

  /** Returns the user id, or null when the token is invalid or expired. */
  verify(token: string): string | null {
    try {
      const payload = jwt.verify(token, this.secret, { algorithms: ['HS256'] });
      return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      return null;
    }
  }
}
