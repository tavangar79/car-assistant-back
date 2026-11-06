import type { RequestHandler, Response } from 'express';
import { UnauthorizedError, UserBlockedError } from '../../shared/errors.ts';
import type { TokenService } from './token.service.ts';
import type { UserRepository } from './user.repository.ts';

const BEARER = /^Bearer\s+(\S+)$/i;
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

/**
 * Rejects the request with 401 unless it carries a valid `Authorization: Bearer <jwt>` of an existing
 * user, and with 403 (`user_blocked`) when an admin blocked that user. The user is loaded on every
 * request, so a block takes effect at once. Read the caller's id in the handler with `authUserId(res)`.
 */
export function requireAuth(tokens: TokenService, users: UserRepository): RequestHandler {
  return async (req, res, next) => {
    const token = BEARER.exec(req.headers.authorization ?? '')?.[1];
    const userId = token ? tokens.verify(token) : null;
    const user = userId && OBJECT_ID_PATTERN.test(userId) ? await users.findById(userId) : null;
    if (!user) throw new UnauthorizedError();
    if (user.blockedAt) throw new UserBlockedError();

    res.locals.userId = user.id;
    next();
  };
}

/** The authenticated user's id. Only valid behind `requireAuth`. */
export function authUserId(res: Response): string {
  const userId: unknown = res.locals.userId;
  if (typeof userId !== 'string') throw new UnauthorizedError();
  return userId;
}
