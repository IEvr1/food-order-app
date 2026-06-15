/** 8-digit national mobile: 9 + second digit 4–9 + six more (e.g. 99112233, 96123456). */
const CY_LOCAL_MOBILE = /^9[4-9]\d{6}$/;
/** Same number with country code, no leading + in digits string. */
const CY_E164_DIGITS = /^3579[4-9]\d{6}$/;

/**
 * Normalizes user input to E.164 +357… for Cyprus mobiles.
 * Accepts 8 digits without country code (e.g. 99112233) or 11 digits with 357 (e.g. 35799112233).
 */
export function normalizePhone(raw: string) {
  const digitsOnly = raw.replace(/\D/g, "");

  if (CY_E164_DIGITS.test(digitsOnly)) {
    return `+${digitsOnly}`;
  }

  if (CY_LOCAL_MOBILE.test(digitsOnly)) {
    return `+357${digitsOnly}`;
  }

  throw new Error("Invalid Cyprus mobile (8 digits, e.g. 99XXXXXX).");
}

/** Dashboard display: 99112233 → 99-112233 (no +357). */
export function formatPhoneDisplay(e164: string) {
  let digits = e164.replace(/\D/g, "");
  if (digits.startsWith("357") && digits.length >= 11) {
    digits = digits.slice(3);
  }
  if (CY_LOCAL_MOBILE.test(digits)) {
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }
  return digits || e164.replace(/^\+357/, "");
}
