import { NotFoundError } from '../../shared/errors.ts';
import type { DocumentRepository } from '../documents/document.repository.ts';
import type { ExpenseRepository } from '../expenses/expense.repository.ts';
import type { ServiceIntervalService } from '../service-intervals/service-interval.service.ts';
import type { VehicleService } from '../vehicles/vehicle.service.ts';
import type { NotificationRepository } from './notification.repository.ts';
import type { Notification, NotificationRecord } from './notification.types.ts';
import { planNotifications, type VehicleDue } from './plan-notifications.ts';

export interface NotificationServiceDeps {
  notifications: NotificationRepository;
  /** The caller's garage. */
  vehicles: VehicleService;
  /** The existing due computation, reused as is. */
  intervals: ServiceIntervalService;
  expenses: ExpenseRepository;
  documents: DocumentRepository;
  now: () => Date;
}

export const NOTIFICATION_LIST_LIMIT = 100;
export const NOTIFICATION_RETENTION_DAYS = 90;

const DAY_MS = 86_400_000;
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export function toNotification(record: NotificationRecord): Notification {
  return {
    id: record.id,
    kind: record.kind,
    category: record.kind.startsWith('interval_') ? 'service' : 'documents',
    vehicleId: record.vehicleId,
    refId: record.refId,
    subject: record.subject,
    dueKm: record.dueKm,
    remainingKm: record.remainingKm,
    mileageKm: record.mileageKm,
    expiresAt: record.expiresAt,
    thresholdDays: record.thresholdDays,
    read: record.readAt !== null,
    createdAt: record.createdAt,
  };
}

/** In-app notifications, generated lazily (no cron) when the user reads them. */
export class NotificationService {
  constructor(private readonly deps: NotificationServiceDeps) {}

  /**
   * Idempotent: purges notifications older than 90 days, then inserts the planned ones whose key the
   * user doesn't have yet.
   */
  async sync(userId: string, now: Date): Promise<void> {
    const { notifications, vehicles, intervals, expenses, documents } = this.deps;
    await notifications.deleteCreatedBefore(
      userId,
      new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * DAY_MS),
    );

    const garage = await vehicles.list(userId);
    const vehicleIds = garage.map((vehicle) => vehicle.id);
    const dues: VehicleDue[] = [];
    for (const vehicleId of vehicleIds) {
      const report = await intervals.due(userId, vehicleId);
      dues.push({ vehicleId, mileageKm: report.mileageKm, items: report.items });
    }
    const planned = planNotifications({
      now,
      vehicles: dues,
      expenses: await expenses.listByVehicles(vehicleIds),
      documents: await documents.listByVehicles(vehicleIds),
    });

    const existing = await notifications.findExistingKeys(
      userId,
      planned.map((notification) => notification.key),
    );
    await notifications.createMany(
      planned
        .filter((notification) => !existing.has(notification.key))
        .map((notification) => ({ ...notification, userId, createdAt: now })),
    );
  }

  /** Newest first, at most 100, plus the unread count. */
  async list(userId: string): Promise<{ notifications: Notification[]; unreadCount: number }> {
    await this.sync(userId, this.deps.now());
    const records = await this.deps.notifications.listByUser(userId, NOTIFICATION_LIST_LIMIT);
    return {
      notifications: records.map(toNotification),
      unreadCount: await this.deps.notifications.countUnread(userId),
    };
  }

  async unreadCount(userId: string): Promise<number> {
    await this.sync(userId, this.deps.now());
    return this.deps.notifications.countUnread(userId);
  }

  /** Idempotent: an already-read notification keeps its first read time. */
  async markRead(userId: string, id: string): Promise<Notification> {
    const record = OBJECT_ID_PATTERN.test(id)
      ? await this.deps.notifications.findForUser(id, userId)
      : null;
    if (!record) throw new NotFoundError('Notification');
    if (record.readAt) return toNotification(record);
    return toNotification(await this.deps.notifications.markRead(record.id, this.deps.now()));
  }

  /** Returns how many were unread. */
  markAllRead(userId: string): Promise<number> {
    return this.deps.notifications.markAllRead(userId, this.deps.now());
  }
}
