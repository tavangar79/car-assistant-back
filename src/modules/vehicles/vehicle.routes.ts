import { Router } from 'express';
import { parseOrThrow } from '../../shared/validate.ts';
import type { VehicleService } from './vehicle.service.ts';
import { createVehicleSchema, updateVehicleSchema } from './vehicle.types.ts';

export function vehicleRoutes(service: VehicleService): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json(await service.list());
  });

  router.get('/:id', async (req, res) => {
    res.json(await service.getById(req.params.id));
  });

  router.post('/', async (req, res) => {
    const input = parseOrThrow(createVehicleSchema, req.body);
    res.status(201).json(await service.create(input));
  });

  router.patch('/:id', async (req, res) => {
    const input = parseOrThrow(updateVehicleSchema, req.body);
    res.json(await service.update(req.params.id, input));
  });

  router.delete('/:id', async (req, res) => {
    await service.remove(req.params.id);
    res.status(204).end();
  });

  return router;
}
