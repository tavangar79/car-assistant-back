import { z } from 'zod';
import { phoneSchema } from '../auth/auth.types.ts';
import type { VehicleRecord } from '../vehicles/vehicle.types.ts';

export const TRANSFER_STATUSES = ['pending', 'accepted', 'rejected', 'cancelled'] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

/** `phone` is normalized like login (`09xxxxxxxxx`). */
export const createTransferSchema = z.object({ phone: phoneSchema });
export type CreateTransferInput = z.infer<typeof createTransferSchema>;

/** A transfer as stored. */
export interface TransferRecord {
  id: string;
  vehicleId: string;
  fromUserId: string;
  toPhone: string;
  status: TransferStatus;
  createdAt: Date;
  respondedAt: Date | null;
}

export type NewTransfer = Pick<TransferRecord, 'vehicleId' | 'fromUserId' | 'toPhone'>;

/** The vehicle as read when the transfer is shown: the buyer can't read `/api/vehicles/:id` yet. */
export type TransferVehicle = Pick<
  VehicleRecord,
  'nickname' | 'makeId' | 'modelId' | 'trimId' | 'yearJalali' | 'plate' | 'mileageKm'
>;

/** A transfer as exposed by the API. */
export interface Transfer {
  id: string;
  vehicleId: string;
  toPhone: string;
  status: TransferStatus;
  createdAt: Date;
  respondedAt: Date | null;
  vehicle: TransferVehicle;
  /** The seller's `firstName lastName`, or null when both are empty. */
  fromName: string | null;
}

/** Pending transfers only, newest first. */
export interface TransferList {
  incoming: Transfer[];
  outgoing: Transfer[];
}
