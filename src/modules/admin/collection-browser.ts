import type { Prisma } from '@prisma/client';

// The admin collection browser shows only the fields listed here. Never list a hash, a secret, ciphertext
// or a file's `storageKey` (files show as `sizeBytes` + `contentType`; their bytes live in FileStorage).
// collection-browser.test.ts fails when a Prisma model is neither registered nor excluded, so a new
// model can't leak by default.

export interface CollectionEntry {
  /** The `@@map` name. */
  name: string;
  model: Prisma.ModelName;
  /** Display order; every document has exactly these keys. */
  fields: readonly string[];
}

/** Never shown: password hash and TOTP secret, OTP code hashes, OTP request logs. */
export const EXCLUDED_MODELS: readonly Prisma.ModelName[] = ['Admin', 'OtpCode', 'OtpRequest'];

export const COLLECTIONS = [
  {
    name: 'users',
    model: 'User',
    fields: [
      'id',
      'phone',
      'firstName',
      'lastName',
      'birthDate',
      'blockedAt',
      'blockReason',
      'createdAt',
      'updatedAt',
    ],
  },
  {
    name: 'vehicles',
    model: 'Vehicle',
    fields: [
      'id',
      'userId',
      'nickname',
      'plate',
      'vin',
      'makeId',
      'modelId',
      'trimId',
      'yearJalali',
      'mileageKm',
      'color',
      'isDefault',
      'ownedSince',
      'createdAt',
      'updatedAt',
    ],
  },
  {
    name: 'vehicle_photos',
    model: 'VehiclePhoto',
    fields: ['id', 'vehicleId', 'contentType', 'sizeBytes', 'updatedAt'],
  },
  {
    name: 'odometer_readings',
    model: 'OdometerReading',
    fields: ['id', 'vehicleId', 'mileageKm', 'recordedAt', 'createdAt'],
  },
  {
    name: 'service_visits',
    model: 'ServiceVisit',
    fields: [
      'id',
      'vehicleId',
      'serviceDate',
      'odometerKm',
      'workshop',
      'notes',
      'lineItems',
      'totalCost',
      'createdAt',
      'updatedAt',
    ],
  },
  {
    name: 'service_invoices',
    model: 'ServiceInvoice',
    fields: ['id', 'serviceId', 'fileName', 'contentType', 'sizeBytes', 'updatedAt'],
  },
  {
    name: 'service_intervals',
    model: 'ServiceInterval',
    fields: ['id', 'vehicleId', 'intervalId', 'km', 'months', 'updatedAt'],
  },
  {
    name: 'fuel_logs',
    model: 'FuelLog',
    fields: [
      'id',
      'vehicleId',
      'fueledAt',
      'odometerKm',
      'fuelType',
      'volume',
      'totalCost',
      'isFullFill',
      'station',
      'paymentMethod',
      'notes',
      'createdAt',
      'updatedAt',
    ],
  },
  {
    name: 'expenses',
    model: 'Expense',
    fields: [
      'id',
      'vehicleId',
      'category',
      'amount',
      'title',
      'referenceNumber',
      'paidAt',
      'expiresAt',
      'expiryReminder',
      'paymentMethod',
      'issuer',
      'createdAt',
      'updatedAt',
    ],
  },
  {
    name: 'expense_attachments',
    model: 'ExpenseAttachment',
    fields: ['id', 'expenseId', 'fileName', 'contentType', 'sizeBytes', 'updatedAt'],
  },
  {
    name: 'vehicle_documents',
    model: 'VehicleDocument',
    fields: [
      'id',
      'vehicleId',
      'type',
      'title',
      'issuer',
      'number',
      'issuedAt',
      'expiresAt',
      'expiryReminder',
      'notes',
      'createdAt',
      'updatedAt',
    ],
  },
  {
    name: 'vehicle_document_files',
    model: 'VehicleDocumentFile',
    fields: ['id', 'documentId', 'fileName', 'contentType', 'sizeBytes', 'createdAt'],
  },
  {
    name: 'notifications',
    model: 'Notification',
    fields: [
      'id',
      'userId',
      'vehicleId',
      'key',
      'kind',
      'refId',
      'subject',
      'dueKm',
      'remainingKm',
      'mileageKm',
      'expiresAt',
      'thresholdDays',
      'readAt',
      'createdAt',
    ],
  },
  {
    name: 'vehicle_transfers',
    model: 'VehicleTransfer',
    fields: ['id', 'vehicleId', 'fromUserId', 'toPhone', 'status', 'createdAt', 'respondedAt'],
  },
  {
    name: 'service_item_defs',
    model: 'ServiceItemDef',
    fields: [
      'id',
      'itemId',
      'makeId',
      'modelId',
      'trimId',
      'categoryId',
      'title',
      'subtitle',
      'icon',
      'sortOrder',
      'disabled',
      'createdAt',
      'updatedAt',
    ],
  },
  {
    name: 'interval_defs',
    model: 'IntervalDef',
    fields: [
      'id',
      'intervalId',
      'makeId',
      'modelId',
      'trimId',
      'title',
      'description',
      'icon',
      'coversItemIds',
      'km',
      'months',
      'sortOrder',
      'disabled',
      'createdAt',
      'updatedAt',
    ],
  },
  {
    name: 'user_avatars',
    model: 'UserAvatar',
    fields: ['id', 'userId', 'contentType', 'sizeBytes', 'updatedAt'],
  },
] as const satisfies readonly CollectionEntry[];

export type CollectionName = (typeof COLLECTIONS)[number]['name'];

/** A raw row (as Prisma returns it); `toDocument` decides what is shown. */
export type Row = Record<string, unknown>;

export function findCollection(name: string): CollectionEntry | undefined {
  return (COLLECTIONS as readonly CollectionEntry[]).find((entry) => entry.name === name);
}

/** The shown document: exactly the entry's fields, in order, with missing values as null. */
export function toDocument(entry: CollectionEntry, row: Row): Row {
  return Object.fromEntries(entry.fields.map((field) => [field, row[field] ?? null]));
}
