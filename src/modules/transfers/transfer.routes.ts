import { Router } from 'express';
import { parseOrThrow } from '../../shared/validate.ts';
import { authUserId } from '../auth/require-auth.ts';
import type { TransferService } from './transfer.service.ts';
import { createTransferSchema } from './transfer.types.ts';

/** `/:id/transfers` of the vehicles router; mount behind `requireAuth`. */
export function vehicleTransferRoutes(service: TransferService): Router {
  const router = Router();

  router.post('/:id/transfers', async (req, res) => {
    const { phone } = parseOrThrow(createTransferSchema, req.body);
    const transfer = await service.create(authUserId(res), req.params.id, phone);
    res.status(201).json({ transfer });
  });

  return router;
}

/** `/api/transfers`; mount behind `requireAuth`. Both sides of a transfer use it. */
export function transferRoutes(service: TransferService): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json(await service.list(authUserId(res)));
  });

  router.delete('/:id', async (req, res) => {
    await service.cancel(authUserId(res), req.params.id);
    res.status(204).end();
  });

  router.post('/:id/reject', async (req, res) => {
    await service.reject(authUserId(res), req.params.id);
    res.status(204).end();
  });

  router.post('/:id/accept', async (req, res) => {
    res.json({ vehicle: await service.accept(authUserId(res), req.params.id) });
  });

  return router;
}
