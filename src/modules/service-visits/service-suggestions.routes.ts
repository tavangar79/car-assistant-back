import { Router } from 'express';
import { authUserId } from '../auth/require-auth.ts';
import type { ServiceVisitService } from './service-visit.service.ts';

/** `/api/service-suggestions`; mount behind `requireAuth`. Spans the whole garage, so not under a vehicle. */
export function serviceSuggestionRoutes(service: ServiceVisitService): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json(await service.suggestions(authUserId(res)));
  });

  return router;
}
