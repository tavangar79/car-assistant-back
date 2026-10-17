import { Router } from 'express';
import type { VehicleCatalog } from './vehicle-catalog.ts';

export function vehicleCatalogRoutes(catalog: VehicleCatalog): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(catalog.list());
  });

  return router;
}
