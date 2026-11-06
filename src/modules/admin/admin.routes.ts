import { Router, type RequestHandler } from 'express';
import { parseOrThrow } from '../../shared/validate.ts';
import { catalogAdminRoutes } from '../service-catalog/catalog-admin.routes.ts';
import type { CatalogAdminService } from '../service-catalog/catalog-admin.service.ts';
import { vehicleCatalogRoutes } from '../vehicle-catalog/vehicle-catalog.routes.ts';
import type { VehicleCatalog } from '../vehicle-catalog/vehicle-catalog.ts';
import type { AdminAuthService } from './admin-auth.service.ts';
import type { AdminStatsService } from './admin-stats.service.ts';
import type { AdminUsersService } from './admin-users.service.ts';
import {
  adminLoginSchema,
  blockUserSchema,
  collectionQuerySchema,
  createAdminUpdateUserSchema,
  statsQuerySchema,
  userListQuerySchema,
} from './admin.types.ts';
import type { CollectionBrowserService } from './collection-browser.service.ts';
import { authAdminId } from './require-admin-token.ts';

export interface AdminRouteDeps {
  auth: AdminAuthService;
  /** `requireAdminToken`: every route except login sits behind it. */
  authenticate: RequestHandler;
  /** Per-IP limit on login attempts. */
  limitLogin: RequestHandler;
  catalog: CatalogAdminService;
  vehicleCatalog: VehicleCatalog;
  users: AdminUsersService;
  collections: CollectionBrowserService;
  stats: AdminStatsService;
  now: () => Date;
}

/** Everything under `/api/admin`. */
export function adminRoutes(deps: AdminRouteDeps): Router {
  const router = Router();
  const updateUserSchema = createAdminUpdateUserSchema(deps.now);

  router.post('/auth/login', deps.limitLogin, async (req, res) => {
    const input = parseOrThrow(adminLoginSchema, req.body);
    res.json(await deps.auth.login(input, req.ip ?? 'unknown'));
  });

  router.use(deps.authenticate);

  router.get('/auth/me', async (_req, res) => {
    res.json({ admin: await deps.auth.profile(authAdminId(res)) });
  });

  router.get('/stats', async (req, res) => {
    res.json(await deps.stats.stats(parseOrThrow(statsQuerySchema, req.query)));
  });

  router.get('/users', async (req, res) => {
    const page = await deps.users.list(parseOrThrow(userListQuerySchema, req.query));
    res.json({ users: page.items, nextCursor: page.nextCursor });
  });

  router.get('/users/:id', async (req, res) => {
    res.json(await deps.users.detail(req.params.id));
  });

  router.patch('/users/:id', async (req, res) => {
    const changes = parseOrThrow(updateUserSchema, req.body);
    res.json({ user: await deps.users.update(req.params.id, changes) });
  });

  router.post('/users/:id/block', async (req, res) => {
    const { reason } = parseOrThrow(blockUserSchema, req.body ?? {});
    res.json({ user: await deps.users.block(req.params.id, reason) });
  });

  router.post('/users/:id/unblock', async (req, res) => {
    res.json({ user: await deps.users.unblock(req.params.id) });
  });

  router.get('/collections', async (_req, res) => {
    res.json({ collections: await deps.collections.list() });
  });

  router.get('/collections/:name', async (req, res) => {
    const query = parseOrThrow(collectionQuerySchema, req.query);
    res.json(await deps.collections.browse(req.params.name, query));
  });

  router.use('/vehicle-catalog', vehicleCatalogRoutes(deps.vehicleCatalog));
  router.use(catalogAdminRoutes(deps.catalog));

  return router;
}
