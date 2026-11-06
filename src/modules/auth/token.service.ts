import jwt, { type SignOptions } from 'jsonwebtoken';

export interface IssuedToken {
  token: string;
  expiresAt: Date;
}

/**
 * Issues and checks access tokens (HS256 JWT, `sub` = user or admin id).
 * User tokens carry no `aud`; admin tokens use another secret and `aud: "admin"`.
 * Each instance only accepts tokens with exactly its own audience (or none).
 */
export class TokenService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string,
    private readonly audience?: string,
  ) {}

  sign(subject: string): string {
    return this.issue(subject).token;
  }

  issue(subject: string): IssuedToken {
    const token = jwt.sign({}, this.secret, {
      algorithm: 'HS256',
      subject,
      expiresIn: this.expiresIn as SignOptions['expiresIn'],
      ...(this.audience ? { audience: this.audience } : {}),
    });
    const { exp } = jwt.decode(token) as { exp: number };
    return { token, expiresAt: new Date(exp * 1000) };
  }

  /** Returns the subject, or null when the token is invalid, expired or for another audience. */
  verify(token: string): string | null {
    try {
      const payload = jwt.verify(token, this.secret, {
        algorithms: ['HS256'],
        ...(this.audience ? { audience: this.audience } : {}),
      });
      if (typeof payload !== 'object' || typeof payload.sub !== 'string') return null;
      if (!this.audience && payload.aud !== undefined) return null;
      return payload.sub;
    } catch {
      return null;
    }
  }
}
