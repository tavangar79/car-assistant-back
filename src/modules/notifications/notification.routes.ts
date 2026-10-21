import { Router } from 'express';
import { authUserId } from '../auth/require-auth.ts';
import type { NotificationService } from './notification.service.ts';

/** `/api/notifications`; mount behind `requireAuth`. */
export function notificationRoutes(service: NotificationService): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json(await service.list(authUserId(res)));
  });

  router.get('/unread-count', async (_req, res) => {
    res.json({ unreadCount: await service.unreadCount(authUserId(res)) });
  });

  router.patch('/:id/read', async (req, res) => {
    res.json({ notification: await service.markRead(authUserId(res), req.params.id) });
  });

  router.post('/read-all', async (_req, res) => {
    res.json({ updatedCount: await service.markAllRead(authUserId(res)) });
  });

  return router;
}
