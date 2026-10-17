import { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import { TooManyRequestsError, ValidationError } from '../../shared/errors.ts';
import { parseOrThrow } from '../../shared/validate.ts';
import type { AuthService } from './auth.service.ts';
import {
  createUpdateProfileSchema,
  createVerifyOtpSchema,
  requestOtpSchema,
} from './auth.types.ts';
import { AVATAR_FIELD, avatarUpload } from './avatar-upload.ts';
import { authUserId } from './require-auth.ts';

export interface AuthRouteOptions {
  /** Guard for protected routes (`requireAuth`). */
  authenticate: RequestHandler;
  /** Per-IP limit shared by the two OTP endpoints. */
  limitByIp: RequestHandler;
  codeLength: number;
  /** Clock for "not in the future" checks. */
  now: () => Date;
  avatarMaxBytes: number;
}

// The `v` query in avatarUrl changes on every upload, so the image itself can be cached for a year.
const AVATAR_CACHE_CONTROL = 'private, max-age=31536000';

export function authRoutes(
  service: AuthService,
  { authenticate, limitByIp, codeLength, now, avatarMaxBytes }: AuthRouteOptions,
): Router {
  const router = Router();
  const verifyOtpSchema = createVerifyOtpSchema(codeLength);
  const updateProfileSchema = createUpdateProfileSchema(now);

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

  router.put('/me', authenticate, async (req, res) => {
    const profile = parseOrThrow(updateProfileSchema, req.body);
    res.json(await service.updateProfile(authUserId(res), profile));
  });

  router.put('/me/avatar', authenticate, avatarUpload(avatarMaxBytes), async (req, res) => {
    if (!req.file) throw new ValidationError({ [AVATAR_FIELD]: ['Required'] });
    res.json(await service.uploadAvatar(authUserId(res), req.file.buffer));
  });

  router.get('/me/avatar', authenticate, async (_req, res) => {
    const avatar = await service.getAvatar(authUserId(res));
    res
      .set('Content-Type', avatar.contentType)
      .set('Cache-Control', AVATAR_CACHE_CONTROL)
      .send(Buffer.from(avatar.data));
  });

  router.delete('/me/avatar', authenticate, async (_req, res) => {
    res.json(await service.deleteAvatar(authUserId(res)));
  });

  return router;
}
