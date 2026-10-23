import { Router } from 'express';
import { parseOrThrow } from '../../shared/validate.ts';
import type { CatalogAdminService } from './catalog-admin.service.ts';
import {
  createIntervalDefSchema,
  createServiceItemDefSchema,
  updateIntervalDefSchema,
  updateServiceItemDefSchema,
} from './catalog.types.ts';

/** `/service-items` and `/intervals` of `/api/admin`; mount behind `requireAuth` and `requireAdmin`. */
export function catalogAdminRoutes(service: CatalogAdminService): Router {
  const router = Router();

  router.get('/service-items', async (_req, res) => {
    res.json({ items: await service.listItems() });
  });

  router.post('/service-items', async (req, res) => {
    const input = parseOrThrow(createServiceItemDefSchema, req.body);
    res.status(201).json({ item: await service.createItem(input) });
  });

  router.patch('/service-items/:id', async (req, res) => {
    const input = parseOrThrow(updateServiceItemDefSchema, req.body);
    res.json({ item: await service.updateItem(req.params.id, input) });
  });

  router.delete('/service-items/:id', async (req, res) => {
    await service.deleteItem(req.params.id);
    res.status(204).end();
  });

  router.get('/intervals', async (_req, res) => {
    res.json({ intervals: await service.listIntervals() });
  });

  router.post('/intervals', async (req, res) => {
    const input = parseOrThrow(createIntervalDefSchema, req.body);
    res.status(201).json({ interval: await service.createInterval(input) });
  });

  router.patch('/intervals/:id', async (req, res) => {
    const input = parseOrThrow(updateIntervalDefSchema, req.body);
    res.json({ interval: await service.updateInterval(req.params.id, input) });
  });

  router.delete('/intervals/:id', async (req, res) => {
    await service.deleteInterval(req.params.id);
    res.status(204).end();
  });

  return router;
}
