/** Where a catalog row applies. All null = global; `modelId` implies `makeId`, `trimId` implies `modelId`. */
export interface CatalogScope {
  makeId: string | null;
  modelId: string | null;
  trimId: string | null;
}

/** What resolution needs of a row: its scope, ordering and whether it hides the definition. */
export interface ScopedRow extends CatalogScope {
  sortOrder: number;
  disabled: boolean;
}

/** The parts of a vehicle a scope is matched against. */
export interface VehicleScope {
  makeId: string;
  modelId: string;
  trimId: string | null;
}

/** The scope fields of a vehicle as the API exposes it (`make` / `model` / `trim` refs). */
export function vehicleScope(vehicle: {
  make: { id: string };
  model: { id: string };
  trim: { id: string } | null;
}): VehicleScope {
  return { makeId: vehicle.make.id, modelId: vehicle.model.id, trimId: vehicle.trim?.id ?? null };
}

/** trim 3 > model 2 > make 1 > global 0. */
export function specificity(scope: CatalogScope): number {
  if (scope.trimId !== null) return 3;
  if (scope.modelId !== null) return 2;
  if (scope.makeId !== null) return 1;
  return 0;
}

/** Each non-null scope field equals the vehicle's field. */
export function matchesVehicle(scope: CatalogScope, vehicle: VehicleScope): boolean {
  return (
    (scope.makeId === null || scope.makeId === vehicle.makeId) &&
    (scope.modelId === null || scope.modelId === vehicle.modelId) &&
    (scope.trimId === null || scope.trimId === vehicle.trimId)
  );
}

const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** One row per key, ordered by `sortOrder`, then key. */
function pickPerKey<T extends ScopedRow>(
  rows: T[],
  keyOf: (row: T) => string,
  isBetter: (candidate: T, current: T) => boolean,
): T[] {
  const picked = new Map<string, T>();
  for (const row of rows) {
    const current = picked.get(keyOf(row));
    if (!current || isBetter(row, current)) picked.set(keyOf(row), row);
  }
  return [...picked.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder || compareStrings(keyOf(a), keyOf(b)),
  );
}

/**
 * Pure: for each key, the most specific row matching the vehicle. The picked row fully replaces the
 * definition; a picked `disabled` row means the definition is disabled for the vehicle (it is kept, so
 * callers decide whether to show it).
 */
export function resolveForVehicle<T extends ScopedRow>(
  rows: T[],
  vehicle: VehicleScope,
  keyOf: (row: T) => string,
): T[] {
  return pickPerKey(
    rows.filter((row) => matchesVehicle(row, vehicle)),
    keyOf,
    (candidate, current) => specificity(candidate) > specificity(current),
  );
}

/** Pure: for each key, the least specific row (global when it exists). For title lookups across vehicles. */
export function resolveLeastSpecific<T extends ScopedRow>(
  rows: T[],
  keyOf: (row: T) => string,
): T[] {
  return pickPerKey(rows, keyOf, (candidate, current) => {
    return specificity(candidate) < specificity(current);
  });
}
