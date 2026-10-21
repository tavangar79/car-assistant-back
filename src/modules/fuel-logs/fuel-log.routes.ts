import { Router } from 'express';
import { parseOrThrow } from '../../shared/validate.ts';
import { authUserId } from '../auth/require-auth.ts';
import type { FuelLogService } from './fuel-log.service.ts';
import { createFuelLogSchema, updateFuelLogSchema } from './fuel-log.types.ts';

/** `/:id/fuel` of the vehicles router; mount behind `requireAuth`. */
export function fuelLogRoutes(service: FuelLogService): Router {
  const router = Router();

  router.post('/:id/fuel', async (req, res) => {
    const input = parseOrThrow(createFuelLogSchema, req.body);
    const fuelLog = await service.create(authUserId(res), req.params.id, input);
    res.status(201).json({ fuelLog });
  });

  router.get('/:id/fuel', async (req, res) => {
    res.json({ fuelLogs: await service.list(authUserId(res), req.params.id) });
  });

  router.get('/:id/fuel/:fuelLogId', async (req, res) => {
    const { id, fuelLogId } = req.params;
    res.json({ fuelLog: await service.getById(authUserId(res), id, fuelLogId) });
  });

  router.patch('/:id/fuel/:fuelLogId', async (req, res) => {
    const input = parseOrThrow(updateFuelLogSchema, req.body);
    const { id, fuelLogId } = req.params;
    res.json({ fuelLog: await service.update(authUserId(res), id, fuelLogId, input) });
  });

  router.delete('/:id/fuel/:fuelLogId', async (req, res) => {
    const { id, fuelLogId } = req.params;
    await service.remove(authUserId(res), id, fuelLogId);
    res.status(204).end();
  });

  return router;
}
