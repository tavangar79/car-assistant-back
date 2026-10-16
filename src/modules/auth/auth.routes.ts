import { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import { TooManyRequestsError } from '../../shared/errors.ts';
import { parseOrThrow } from '../../shared/validate.ts';
import type { AuthService } from './auth.service.ts';
import { createVerifyOtpSchema, requestOtpSchema } from './auth.types.ts';
import { authUserId } from './require-auth.ts';

export interface AuthRouteOptions {
  /** Guard for protected routes (`requireAuth`). */
  authenticate: RequestHandler;
  /** Per-IP limit shared by the two OTP endpoints. */
  limitByIp: RequestHandler;
  codeLength: number;
}

export function authRoutes(
  service: AuthService,
  { authenticate, limitByIp, codeLength }: AuthRouteOptions,
): Router {
  const router = Router();
  const verifyOtpSchema = createVerifyOtpSchema(codeLength);

  // Every 429 from /otp/request (IP limit, cooldown, per-phone cap) also tells the client the code length.
  const addCodeLengthTo429: ErrorRequestHandler = (err, _req, _res, next) => {
    next(
      err instanceof TooManyRequestsError
        ? new TooManyRequestsError(err.retryAfterSeconds, { codeLength })
        : err,
    );
  };

  const requestOtp: RequestHandler = async (req, res) => {
    const { phone } = parseOrThrow(requestOtpSchema, req.body);
    res.json(await service.requestOtp(phone));
  };

  router.post('/otp/request', limitByIp, requestOtp, addCodeLengthTo429);

  router.post('/otp/verify', limitByIp, async (req, res) => {
    const { phone, code } = parseOrThrow(verifyOtpSchema, req.body);
    res.json(await service.verifyOtp(phone, code));
  });

  router.get('/me', authenticate, async (_req, res) => {
    res.json(await service.getProfile(authUserId(res)));
  });

  return router;
}
