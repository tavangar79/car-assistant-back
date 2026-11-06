import { Router } from 'express';
import { AppError } from '../../shared/errors.ts';

/** Resolves when the database answers, rejects otherwise. */
export type DatabaseCheck = () => Promise<void>;

export function healthRoutes(checkDatabase: DatabaseCheck): Router {
  const router = Router();

  // Liveness: the process is up. Never touches the database.
  router.get('/', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Readiness: the process can serve traffic, i.e. the database is reachable.
  router.get('/ready', async (_req, res) => {
    try {
      await checkDatabase();
    } catch {
      throw new AppError(503, 'Database unavailable');
    }
    res.json({ status: 'ok' });
  });

  return router;
}
