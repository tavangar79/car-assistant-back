import { Router } from 'express';
import { parseOrThrow } from '../../shared/validate.ts';
import { authUserId } from '../auth/require-auth.ts';
import type { ServiceIntervalService } from './service-interval.service.ts';
import { setIntervalsSchema } from './service-interval.types.ts';

/** `/:id/intervals` and `/:id/due` of the vehicles router; mount behind `requireAuth`. */
export function serviceIntervalRoutes(service: ServiceIntervalService): Router {
  const router = Router();

  router.get('/:id/intervals', async (req, res) => {
    res.json({ intervals: await service.list(authUserId(res), req.params.id) });
  });

  router.put('/:id/intervals', async (req, res) => {
    const input = parseOrThrow(setIntervalsSchema, req.body);
    res.json({ intervals: await service.set(authUserId(res), req.params.id, input) });
  });

  router.delete('/:id/intervals', async (req, res) => {
    res.json({ intervals: await service.resetAll(authUserId(res), req.params.id) });
  });

  router.get('/:id/due', async (req, res) => {
    res.json(await service.due(authUserId(res), req.params.id));
  });

  return router;
}
