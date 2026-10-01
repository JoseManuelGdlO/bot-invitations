const MX_PHONE_LEN = 10;

export const MX_PHONE_HINT = "10 dígitos con lada, sin +52. Ej. 5512345678";
export const MX_PHONE_ERROR =
  "El teléfono debe tener 10 dígitos con lada (ej. 5512345678).";

export function phoneDigits(value: string): string {
  return String(value || "").replace(/\D/g, "");
}

function localDigitsFrom(digits: string): string | null {
  if (digits.length === 13 && digits.startsWith("521")) return digits.slice(3);
  if (digits.length === 12 && digits.startsWith("52")) return digits.slice(2);
  if (digits.length === 10) return digits;
  return null;
}

export function sanitizeMxPhoneInput(value: string): string {
  const digits = phoneDigits(value);
  if (digits.startsWith("521") && digits.length > MX_PHONE_LEN) {
    return digits.slice(3, 3 + MX_PHONE_LEN);
  }
  if (digits.startsWith("52") && digits.length > MX_PHONE_LEN) {
    return digits.slice(2, 2 + MX_PHONE_LEN);
  }
  return digits.slice(0, MX_PHONE_LEN);
}

export function mxPhoneError(value: string): string | null {
  const digits = phoneDigits(value);
  if (!digits) return "El teléfono es requerido.";
  if (!localDigitsFrom(digits)) return MX_PHONE_ERROR;
  return null;
}

const GUEST_PHONE_MAX = 15;

export const GUEST_PHONE_HINT =
  "10 dígitos en México (ej. 5512345678). Otros países: lada + 10 dígitos (ej. 18177272994).";

export const GUEST_PHONE_ERROR =
  "Usa 10 dígitos (México) o la lada del país más 10 dígitos. Ej. 5512345678 o 18177272994.";

export function sanitizeGuestPhoneInput(value: string): string {
  return phoneDigits(value).slice(0, GUEST_PHONE_MAX);
}

export function isUsGuestPhone(value: string): boolean {
  const digits = phoneDigits(value);
  if (!digits.startsWith("1")) return false;
  return digits.length === 10 || digits.length === 11;
}

export function guestPhoneError(value: string): string | null {
  const digits = phoneDigits(value);
  if (!digits) return "El teléfono es requerido.";
  if (digits.length === MX_PHONE_LEN) return null;
  if (digits.length > MX_PHONE_LEN && digits.length <= GUEST_PHONE_MAX) return null;
  return GUEST_PHONE_ERROR;
}
