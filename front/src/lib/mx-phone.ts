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
