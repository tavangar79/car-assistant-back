import { z } from 'zod';

const currentYear = new Date().getFullYear();

export const createVehicleSchema = z.object({
  make: z.string().trim().min(1),
  model: z.string().trim().min(1),
  year: z.number().int().min(1900).max(currentYear + 1),
  mileageKm: z.number().int().min(0).default(0),
});

export const updateVehicleSchema = createVehicleSchema.partial();

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  mileageKm: number;
  createdAt: Date;
  updatedAt: Date;
}
