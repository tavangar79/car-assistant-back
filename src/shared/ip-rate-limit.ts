import type { RequestHandler } from 'express';
import { rateLimit, type AugmentedRequest } from 'express-rate-limit';
import { TooManyRequestsError } from './errors.ts';

export interface IpRateLimitSettings {
  max: number;
  windowSeconds: number;
}

/**
 * At most `max` requests per client IP per window (in memory, per process).
 * Over the limit it forwards a TooManyRequestsError, so the error handler sends the
 * usual 429 body and the Retry-After header.
 */
export function ipRateLimit({ max, windowSeconds }: IpRateLimitSettings): RequestHandler {
  return rateLimit({
    limit: max,
    windowMs: windowSeconds * 1000,
    standardHeaders: false,
    legacyHeaders: false,
    handler: (req, _res, next) => {
      const resetTime = (req as AugmentedRequest).rateLimit?.resetTime;
      const seconds = resetTime
        ? Math.ceil((resetTime.getTime() - Date.now()) / 1000)
        : windowSeconds;
      next(new TooManyRequestsError(Math.max(1, seconds)));
    },
  });
}
