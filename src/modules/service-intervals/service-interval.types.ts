import { z } from 'zod';
import type { ServiceIntervalDefinition } from './service-interval.data.ts';

export const INTERVAL_KM_MIN = 500;
export const INTERVAL_KM_MAX = 200_000;
export const INTERVAL_MONTHS_MAX = 120;

// Unknown ids depend on the catalog, so ServiceIntervalService checks them.
export const setIntervalsSchema = z.object({
  intervals: z.array(
    z.object({
      id: z.string().min(1),
      km: z.number().int().min(INTERVAL_KM_MIN).max(INTERVAL_KM_MAX),
      months: z.number().int().min(1).max(INTERVAL_MONTHS_MAX),
    }),
  ),
});

export type SetIntervalsInput = z.infer<typeof setIntervalsSchema>;

/** A vehicle's override as stored. A missing row means factory default. */
export interface ServiceIntervalOverride {
  vehicleId: string;
  intervalId: string;
  km: number;
  months: number;
}

/** An interval as exposed by the API: the definition plus the vehicle's effective values. */
export interface ServiceInterval extends ServiceIntervalDefinition {
  km: number;
  months: number;
  isCustom: boolean;
}
