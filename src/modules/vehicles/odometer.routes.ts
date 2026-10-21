import { Router } from 'express';
import { parseOrThrow } from '../../shared/validate.ts';
import { authUserId } from '../auth/require-auth.ts';
import type { OdometerService } from './odometer.service.ts';
import { recordOdometerSchema } from './odometer.types.ts';

/** `/:id/odometer` of the vehicles router; mount behind `requireAuth`. */
export function odometerRoutes(service: OdometerService): Router {
  const router = Router();

  router.post('/:id/odometer', async (req, res) => {
    const input = parseOrThrow(recordOdometerSchema, req.body);
    res.status(201).json(await service.record(authUserId(res), req.params.id, input));
  });

  router.get('/:id/odometer', async (req, res) => {
    res.json({ readings: await service.list(authUserId(res), req.params.id) });
  });

  return router;
}
