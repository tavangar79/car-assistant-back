import type { RequestHandler, Response } from 'express';
import { UnauthorizedError } from '../../shared/errors.ts';
import type { TokenService } from './token.service.ts';

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * Rejects the request with 401 unless it carries a valid `Authorization: Bearer <jwt>`.
 * Read the caller's id in the handler with `authUserId(res)`.
 */
export function requireAuth(tokens: TokenService): RequestHandler {
  return (req, res, next) => {
    const token = BEARER.exec(req.headers.authorization ?? '')?.[1];
    const userId = token ? tokens.verify(token) : null;
    if (!userId) throw new UnauthorizedError();

    res.locals.userId = userId;
    next();
  };
}

/** The authenticated user's id. Only valid behind `requireAuth`. */
export function authUserId(res: Response): string {
  const userId: unknown = res.locals.userId;
  if (typeof userId !== 'string') throw new UnauthorizedError();
  return userId;
}
