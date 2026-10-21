import { randomBytes } from 'node:crypto';
import type { NotificationRepository } from '../modules/notifications/notification.repository.ts';
import type {
  NewNotification,
  NotificationRecord,
} from '../modules/notifications/notification.types.ts';

export class InMemoryNotificationRepository implements NotificationRepository {
  /** Insertion order is creation order. */
  readonly notifications = new Map<string, NotificationRecord>();

  async listByUser(userId: string, limit: number): Promise<NotificationRecord[]> {
    return this.ofUser(userId)
      .map((notification, index) => ({ notification, index }))
      .sort(
        (a, b) =>
          b.notification.createdAt.getTime() - a.notification.createdAt.getTime() ||
          b.index - a.index,
      )
      .slice(0, limit)
      .map(({ notification }) => notification);
  }

  async countUnread(userId: string): Promise<number> {
    return this.ofUser(userId).filter((n) => n.readAt === null).length;
  }

  async findForUser(id: string, userId: string): Promise<NotificationRecord | null> {
    const notification = this.notifications.get(id);
    return notification?.userId === userId ? notification : null;
  }

  async findExistingKeys(userId: string, keys: string[]): Promise<Set<string>> {
    return new Set(
      this.ofUser(userId)
        .map((n) => n.key)
        .filter((key) => keys.includes(key)),
    );
  }

  async createMany(notifications: NewNotification[]): Promise<void> {
    for (const input of notifications) {
      const existing = await this.findExistingKeys(input.userId, [input.key]);
      if (existing.size > 0) continue;
      const notification: NotificationRecord = {
        id: randomBytes(12).toString('hex'),
        ...input,
        readAt: null,
      };
      this.notifications.set(notification.id, notification);
    }
  }

  async markRead(id: string, readAt: Date): Promise<NotificationRecord> {
    const existing = this.notifications.get(id);
    if (!existing) throw new Error(`Notification ${id} not found`);
    const updated = { ...existing, readAt };
    this.notifications.set(id, updated);
    return updated;
  }

  async markAllRead(userId: string, readAt: Date): Promise<number> {
    const unread = this.ofUser(userId).filter((n) => n.readAt === null);
    for (const notification of unread)
      this.notifications.set(notification.id, { ...notification, readAt });
    return unread.length;
  }

  async deleteCreatedBefore(userId: string, cutoff: Date): Promise<void> {
    this.deleteWhere((n) => n.userId === userId && n.createdAt.getTime() < cutoff.getTime());
  }

  async deleteByRefIds(refIds: string[]): Promise<void> {
    this.deleteWhere((n) => refIds.includes(n.refId));
  }

  async deleteByVehicle(vehicleId: string): Promise<void> {
    this.deleteWhere((n) => n.vehicleId === vehicleId);
  }

  private ofUser(userId: string): NotificationRecord[] {
    return [...this.notifications.values()].filter((n) => n.userId === userId);
  }

  private deleteWhere(matches: (notification: NotificationRecord) => boolean): void {
    for (const [id, notification] of this.notifications) {
      if (matches(notification)) this.notifications.delete(id);
    }
  }
}
