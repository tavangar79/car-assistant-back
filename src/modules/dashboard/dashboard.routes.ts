import { Router } from 'express';
import { authUserId } from '../auth/require-auth.ts';
import type { DashboardService } from './dashboard.service.ts';

/** `/api/dashboard`; mount behind `requireAuth`. */
export function dashboardRoutes(service: DashboardService): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json({ dashboard: await service.get(authUserId(res)) });
  });

  return router;
}
