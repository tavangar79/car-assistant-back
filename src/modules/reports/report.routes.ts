import { Router } from 'express';
import { parseOrThrow } from '../../shared/validate.ts';
import { authUserId } from '../auth/require-auth.ts';
import type { ReportService } from './report.service.ts';
import { reportQuerySchema } from './report.types.ts';

/** `/api/reports`; mount behind `requireAuth`. */
export function reportRoutes(service: ReportService): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = parseOrThrow(reportQuerySchema, req.query);
    res.json(await service.get(authUserId(res), query));
  });

  return router;
}
