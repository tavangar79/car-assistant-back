import { ForbiddenError } from '../../shared/errors.ts';

export const LOCKED_RECORD = 'این رکورد مربوط به مالک قبلی است و قابل ویرایش نیست';

/**
 * A service visit, fuel log or expense created before the vehicle's last ownership transfer
 * belongs to the previous owner: the new owner sees it but can't change it.
 */
export function isLocked(ownedSince: Date | null, createdAt: Date): boolean {
  return ownedSince !== null && createdAt.getTime() < ownedSince.getTime();
}

/** 403 for a locked record. */
export function ensureUnlocked(ownedSince: Date | null, createdAt: Date): void {
  if (isLocked(ownedSince, createdAt)) throw new ForbiddenError(LOCKED_RECORD);
}
