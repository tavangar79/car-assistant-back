import { Router } from 'express';
import { parseOrThrow } from '../../shared/validate.ts';
import { authUserId } from '../auth/require-auth.ts';
import type { HistoryService } from './history.service.ts';
import { historyQuerySchema } from './history.types.ts';

/** `/api/history`; mount behind `requireAuth`. Spans the whole garage, so not under a vehicle. */
export function historyRoutes(service: HistoryService): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = parseOrThrow(historyQuerySchema, req.query);
    res.json(await service.list(authUserId(res), query));
  });

  return router;
}
