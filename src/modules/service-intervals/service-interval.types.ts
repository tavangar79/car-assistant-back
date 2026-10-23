import { z } from 'zod';

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

/**
 * A tracked interval as resolved for a vehicle: any visit with one of `coversItemIds` resets it.
 * `defaultKm` / `defaultMonths` come from the resolved `IntervalDef` row.
 */
export interface ServiceIntervalDefinition {
  id: string;
  title: string;
  /** One line on what the work is. */
  description: string;
  /** Material Symbols icon name. */
  icon: string;
  coversItemIds: string[];
  defaultKm: number;
  defaultMonths: number;
}

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
