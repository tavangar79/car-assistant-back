import { z } from 'zod';
import type { CatalogRef } from '../vehicle-catalog/vehicle-catalog.ts';

/** Letters of an Iranian plate, as offered by the app. */
export const PLATE_LETTERS = [
  'الف',
  'ب',
  'پ',
  'ت',
  'ث',
  'ج',
  'د',
  'س',
  'ص',
  'ط',
  'ع',
  'ف',
  'ق',
  'ک',
  'گ',
  'ل',
  'م',
  'ن',
  'و',
  'ه',
  'ی',
  'ژ',
  '♿',
] as const;

export const VEHICLE_COLORS = ['white', 'black', 'silver', 'blue', 'red', 'beige'] as const;
export type VehicleColor = (typeof VEHICLE_COLORS)[number];

export const MIN_YEAR_JALALI = 1300;
export const MAX_MILEAGE_KM = 2_000_000;

const plateSchema = z.object({
  twoDigits: z.string().regex(/^\d{2}$/, 'Must be 2 digits'),
  letter: z.enum(PLATE_LETTERS),
  threeDigits: z.string().regex(/^\d{3}$/, 'Must be 3 digits'),
  provinceCode: z.string().regex(/^\d{2}$/, 'Must be 2 digits'),
});

const vinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NPR-Z0-9]{17}$/, 'Must be 17 letters or digits (no I, O or Q)');

// The upper bound of `yearJalali` depends on today, so VehicleService checks it.
export const createVehicleSchema = z.object({
  nickname: z.string().trim().min(1).max(40),
  plate: plateSchema,
  vin: vinSchema.nullish(),
  makeId: z.string().min(1),
  modelId: z.string().min(1),
  trimId: z.string().min(1).nullish(),
  yearJalali: z.number().int().min(MIN_YEAR_JALALI),
  mileageKm: z.number().int().min(0).max(MAX_MILEAGE_KM),
  color: z.enum(VEHICLE_COLORS).nullish(),
  isDefault: z.boolean().optional(),
});

export const updateVehicleSchema = createVehicleSchema.partial();

/** Plate parts with Latin digits; stored as plain strings. */
export interface Plate {
  twoDigits: string;
  letter: string;
  threeDigits: string;
  provinceCode: string;
}
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;

/** A vehicle as stored. Make/model/trim are catalog ids. */
export interface VehicleRecord {
  id: string;
  userId: string;
  nickname: string;
  plate: Plate;
  vin: string | null;
  makeId: string;
  modelId: string;
  trimId: string | null;
  yearJalali: number;
  mileageKm: number;
  color: VehicleColor | null;
  isDefault: boolean;
  /** Set by an accepted ownership transfer; null = owned since `createdAt`. */
  ownedSince: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewVehicle = Omit<VehicleRecord, 'id' | 'createdAt' | 'updatedAt'>;
export type VehicleChanges = Partial<Omit<NewVehicle, 'userId' | 'ownedSince'>>;
/** What an accepted transfer changes. */
export type VehicleOwner = Pick<VehicleRecord, 'userId' | 'ownedSince' | 'isDefault'>;

/** A vehicle as exposed by the API. */
export interface Vehicle {
  id: string;
  nickname: string;
  plate: Plate;
  vin: string | null;
  make: CatalogRef;
  model: CatalogRef;
  trim: CatalogRef | null;
  yearJalali: number;
  mileageKm: number;
  color: VehicleColor | null;
  isDefault: boolean;
  /** `/api/vehicles/:id/photo?v=<updatedAt ms>`, or null without a photo. */
  photoUrl: string | null;
  /** Set by an accepted ownership transfer; null = owned since `createdAt`. */
  ownedSince: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VehiclePhoto {
  contentType: string;
  data: Uint8Array;
  updatedAt: Date;
}

export type NewVehiclePhoto = Omit<VehiclePhoto, 'updatedAt'>;
