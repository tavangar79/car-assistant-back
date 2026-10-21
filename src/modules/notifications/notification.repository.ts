import { Prisma, type PrismaClient } from '@prisma/client';
import type { NewNotification, NotificationRecord } from './notification.types.ts';

export interface NotificationRepository {
  /** Newest `createdAt` first. */
  listByUser(userId: string, limit: number): Promise<NotificationRecord[]>;
  countUnread(userId: string): Promise<number>;
  /** The notification only if it belongs to the user. */
  findForUser(id: string, userId: string): Promise<NotificationRecord | null>;
  /** Which of `keys` the user already has. */
  findExistingKeys(userId: string, keys: string[]): Promise<Set<string>>;
  /** Skips any whose key the user already has (a concurrent sync may have inserted it). */
  createMany(notifications: NewNotification[]): Promise<void>;
  markRead(id: string, readAt: Date): Promise<NotificationRecord>;
  /** Marks every unread one read and returns how many changed. */
  markAllRead(userId: string, readAt: Date): Promise<number>;
  deleteCreatedBefore(userId: string, cutoff: Date): Promise<void>;
  /** Deletes the notifications about these expenses or documents. */
  deleteByRefIds(refIds: string[]): Promise<void>;
  deleteByVehicle(vehicleId: string): Promise<void>;
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listByUser(userId: string, limit: number): Promise<NotificationRecord[]> {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }

  countUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  findForUser(id: string, userId: string): Promise<NotificationRecord | null> {
    return this.prisma.notification.findFirst({ where: { id, userId } });
  }

  async findExistingKeys(userId: string, keys: string[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    const rows = await this.prisma.notification.findMany({
      where: { userId, key: { in: keys } },
      select: { key: true },
    });
    return new Set(rows.map((row) => row.key));
  }

  async createMany(notifications: NewNotification[]): Promise<void> {
    // One by one: MongoDB createMany has no skipDuplicates, and @@unique([userId, key]) rejects a racing duplicate.
    for (const data of notifications) {
      try {
        await this.prisma.notification.create({ data });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
  }

  markRead(id: string, readAt: Date): Promise<NotificationRecord> {
    return this.prisma.notification.update({ where: { id }, data: { readAt } });
  }

  async markAllRead(userId: string, readAt: Date): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt },
    });
    return count;
  }

  async deleteCreatedBefore(userId: string, cutoff: Date): Promise<void> {
    await this.prisma.notification.deleteMany({ where: { userId, createdAt: { lt: cutoff } } });
  }

  async deleteByRefIds(refIds: string[]): Promise<void> {
    if (refIds.length === 0) return;
    await this.prisma.notification.deleteMany({ where: { refId: { in: refIds } } });
  }

  async deleteByVehicle(vehicleId: string): Promise<void> {
    await this.prisma.notification.deleteMany({ where: { vehicleId } });
  }
}
