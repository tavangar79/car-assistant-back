const PERSIAN_ZERO = 0x06f0; // ۰
const ARABIC_ZERO = 0x0660; // ٠

/** Converts Persian (۰-۹) and Arabic-Indic (٠-٩) digits to ASCII 0-9. */
export function toAsciiDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.charCodeAt(0);
    const zero = code >= PERSIAN_ZERO ? PERSIAN_ZERO : ARABIC_ZERO;
    return String(code - zero);
  });
}

const IRANIAN_MOBILE = /^(?:\+98|0098|98|0)(9\d{9})$/;

/**
 * Normalizes an Iranian mobile number (09…, +989…, 989…, 00989…, Persian/Arabic digits,
 * spaces or dashes) to `09xxxxxxxxx`. Returns null when it is not a valid mobile number.
 */
export function normalizeIranianPhone(input: string): string | null {
  const compact = toAsciiDigits(input).replace(/[\s-]/g, '');
  const match = IRANIAN_MOBILE.exec(compact);
  return match ? `0${match[1]}` : null;
}
