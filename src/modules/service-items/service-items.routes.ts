import { Router } from 'express';
import { authUserId } from '../auth/require-auth.ts';
import type { ServiceItemCatalog } from './service-items.ts';

/** Mount behind `requireAuth`. `?vehicleId=` resolves the catalog for that vehicle. */
export function serviceItemRoutes(catalog: ServiceItemCatalog): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { vehicleId } = req.query;
    res.json(
      await catalog.list(authUserId(res), typeof vehicleId === 'string' ? vehicleId : undefined),
    );
  });

  return router;
}
