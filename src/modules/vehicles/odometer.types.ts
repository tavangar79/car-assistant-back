import { z } from 'zod';
import { MAX_MILEAGE_KM, type Vehicle } from './vehicle.types.ts';

// "Not in the future" depends on today, so OdometerService checks it.
export const recordOdometerSchema = z.object({
  mileageKm: z.number().int().min(0).max(MAX_MILEAGE_KM),
  recordedAt: z.string().datetime({ offset: true }).optional(),
});

export type RecordOdometerInput = z.infer<typeof recordOdometerSchema>;

export interface OdometerReading {
  id: string;
  vehicleId: string;
  mileageKm: number;
  recordedAt: Date;
  createdAt: Date;
}

export type NewOdometerReading = Omit<OdometerReading, 'id' | 'createdAt'>;

export interface RecordedOdometer {
  reading: OdometerReading;
  /** The vehicle with its updated `mileageKm`. */
  vehicle: Vehicle;
}
