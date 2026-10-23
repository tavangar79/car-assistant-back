import type { RequestHandler } from 'express';
import { ForbiddenError } from '../../shared/errors.ts';
import { authUserId } from './require-auth.ts';
import type { UserRepository } from './user.repository.ts';

export const ADMIN_ONLY = 'دسترسی ندارید';

/** Use after `requireAuth`: 403 unless the caller's role is `admin`. The role is read on every request. */
export function requireAdmin(users: UserRepository): RequestHandler {
  return async (_req, res, next) => {
    const user = await users.findById(authUserId(res));
    if (user?.role !== 'admin') throw new ForbiddenError(ADMIN_ONLY);
    next();
  };
}
