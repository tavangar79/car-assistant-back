/** The facts of a fuel log that its economy depends on. */
export interface EconomyLog {
  id: string;
  fueledAt: Date;
  odometerKm: number;
  createdAt: Date;
  isFullFill: boolean;
  fuelType: string;
  volume: number;
}

const chronological = (a: EconomyLog, b: EconomyLog) =>
  a.fueledAt.getTime() - b.fueledAt.getTime() ||
  a.odometerKm - b.odometerKm ||
  a.createdAt.getTime() - b.createdAt.getTime();

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Litres per 100 km of every log, keyed by id. A log gets a value only when it is a full fill, an earlier
 * full fill exists, every log since that one (itself included) has the same fuel type, and the odometer
 * moved forward. The fuel between two full fills is the sum of all volumes after the first, up to and
 * including the second. List order does not matter.
 */
export function computeEconomy(logs: readonly EconomyLog[]): Map<string, number | null> {
  const result = new Map<string, number | null>();
  let previousFull: EconomyLog | null = null;
  // Logs after `previousFull`, up to and including the current one.
  let sinceFull: EconomyLog[] = [];

  for (const log of [...logs].sort(chronological)) {
    sinceFull.push(log);
    let economy: number | null = null;
    if (log.isFullFill) {
      if (previousFull) economy = economyBetween(previousFull, sinceFull);
      previousFull = log;
      sinceFull = [];
    }
    result.set(log.id, economy);
  }
  return result;
}

function economyBetween(previousFull: EconomyLog, sinceFull: EconomyLog[]): number | null {
  const current = sinceFull.at(-1)!;
  const km = current.odometerKm - previousFull.odometerKm;
  if (km <= 0 || sinceFull.some((log) => log.fuelType !== previousFull.fuelType)) return null;
  const volume = sinceFull.reduce((sum, log) => sum + log.volume, 0);
  return round2((volume / km) * 100);
}
