import type { RequestHandler, Response } from 'express';
import { UnauthorizedError } from '../../shared/errors.ts';
import type { TokenService } from '../auth/token.service.ts';
import type { AdminAuthService } from './admin-auth.service.ts';

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * 401 unless the request carries a valid admin token (`aud: "admin"`, ADMIN_JWT_SECRET) whose admin
 * row still exists. A user token never passes: it has another secret and no audience.
 */
export function requireAdminToken(tokens: TokenService, auth: AdminAuthService): RequestHandler {
  return async (req, res, next) => {
    const token = BEARER.exec(req.headers.authorization ?? '')?.[1];
    const adminId = token ? tokens.verify(token) : null;
    if (!adminId) throw new UnauthorizedError();

    res.locals.adminId = (await auth.findAdmin(adminId)).id;
    next();
  };
}

/** The authenticated admin's id. Only valid behind `requireAdminToken`. */
export function authAdminId(res: Response): string {
  const adminId: unknown = res.locals.adminId;
  if (typeof adminId !== 'string') throw new UnauthorizedError();
  return adminId;
}
