import { z } from 'zod';
import { MAX_MILEAGE_KM } from '../vehicles/vehicle.types.ts';

export const FUEL_TYPES = ['regular', 'super', 'cng', 'lpg'] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const FUEL_PAYMENT_METHODS = [
  'personal_fuel_card',
  'station_fuel_card',
  'bank_card',
  'cash',
] as const;
export type FuelPaymentMethod = (typeof FUEL_PAYMENT_METHODS)[number];

export const FUEL_VOLUME_MAX = 1000;

const text = (max: number) => z.string().trim().min(1).max(max);

// 48.5 and 0.29 pass; 1.005 does not. The epsilon absorbs binary rounding such as 0.29 * 100 = 28.999…
const hasAtMostTwoDecimals = (value: number) =>
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

// "Not in the future" depends on today, so FuelLogService checks it.
export const createFuelLogSchema = z.object({
  fueledAt: z.string().datetime({ offset: true }),
  odometerKm: z.number().int().min(0).max(MAX_MILEAGE_KM),
  fuelType: z.enum(FUEL_TYPES),
  volume: z
    .number()
    .positive()
    .max(FUEL_VOLUME_MAX)
    .refine(hasAtMostTwoDecimals, 'At most 2 decimals'),
  totalCost: z.number().int().min(0),
  isFullFill: z.boolean(),
  station: text(100).nullish(),
  paymentMethod: z.enum(FUEL_PAYMENT_METHODS).nullish(),
  notes: text(500).nullish(),
});

export const updateFuelLogSchema = createFuelLogSchema.partial();

export type CreateFuelLogInput = z.infer<typeof createFuelLogSchema>;
export type UpdateFuelLogInput = z.infer<typeof updateFuelLogSchema>;

/** A fuel log as stored. */
export interface FuelLogRecord {
  id: string;
  vehicleId: string;
  fueledAt: Date;
  odometerKm: number;
  fuelType: string;
  /** Litres (m³ for cng). */
  volume: number;
  /** Toman. */
  totalCost: number;
  isFullFill: boolean;
  station: string | null;
  paymentMethod: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewFuelLog = Omit<FuelLogRecord, 'id' | 'createdAt' | 'updatedAt'>;
export type FuelLogChanges = Partial<Omit<NewFuelLog, 'vehicleId'>>;

/** A fuel log as exposed by the API. */
export interface FuelLog extends FuelLogRecord {
  /** Litres per 100 km since the previous full fill, or null when it can't be computed. */
  economy: number | null;
  /** Created by a previous owner: read-only (see record-lock.ts). */
  locked: boolean;
}
