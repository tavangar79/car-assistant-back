import { Router } from 'express';
import { authUserId } from '../auth/require-auth.ts';
import type { ProfileService } from './profile.service.ts';

/** `/api/profile`; mount behind `requireAuth`. */
export function profileRoutes(service: ProfileService): Router {
  const router = Router();

  router.get('/stats', async (_req, res) => {
    res.json({ stats: await service.stats(authUserId(res)) });
  });

  return router;
}
