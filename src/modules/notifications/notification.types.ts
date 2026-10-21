export const NOTIFICATION_KINDS = [
  'interval_due_soon',
  'interval_overdue',
  'expense_expiry',
  'document_expiry',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** `system` exists only as a client tab. */
export type NotificationCategory = 'service' | 'documents';

/** What a notification says; `planNotifications` produces these. */
export interface PlannedNotification {
  /** Unique per user; generation is idempotent on it. */
  key: string;
  kind: NotificationKind;
  vehicleId: string;
  /** intervalId, expenseId or documentId. */
  refId: string;
  /** Snapshot title (Persian). */
  subject: string;
  dueKm: number | null;
  remainingKm: number | null;
  mileageKm: number | null;
  /** Expiry kinds: the expiry; interval kinds: the due date. */
  expiresAt: Date | null;
  /** Expiry kinds: 30 | 15 | 7. */
  thresholdDays: number | null;
}

export interface NewNotification extends PlannedNotification {
  userId: string;
  createdAt: Date;
}

/** A notification as stored. */
export interface NotificationRecord extends Omit<NewNotification, 'kind'> {
  id: string;
  kind: string;
  readAt: Date | null;
}

/** A notification as exposed by the API. */
export interface Notification {
  id: string;
  kind: string;
  category: NotificationCategory;
  vehicleId: string;
  refId: string;
  subject: string;
  dueKm: number | null;
  remainingKm: number | null;
  mileageKm: number | null;
  expiresAt: Date | null;
  thresholdDays: number | null;
  read: boolean;
  createdAt: Date;
}
