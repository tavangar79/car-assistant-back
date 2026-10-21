import { Router } from 'express';
import type { ServiceItemCatalog } from './service-items.ts';

export function serviceItemRoutes(catalog: ServiceItemCatalog): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(catalog.list());
  });

  return router;
}
