import { httpError } from "./http-error.js";

export const DEFAULT_EVENT_TIMEZONE = "America/Mexico_City";

export function validateTimezone(timezone) {
  if (typeof timezone !== "string" || !timezone.trim()) {
    throw httpError(400, "Zona horaria inválida.");
  }
  const trimmed = timezone.trim();
  let canonical = trimmed;
  if (typeof Intl.supportedValuesOf === "function") {
    const match = Intl.supportedValuesOf("timeZone").find((tz) => tz.toLowerCase() === trimmed.toLowerCase());
    if (match) canonical = match;
  }
  try {
    Intl.DateTimeFormat("en-US", { timeZone: canonical });
  } catch {
    throw httpError(400, "Zona horaria inválida.");
  }
  return canonical;
}

export function resolveEventTimezone(timezone) {
  if (!timezone || typeof timezone !== "string" || !timezone.trim()) {
    return DEFAULT_EVENT_TIMEZONE;
  }
  try {
    return validateTimezone(timezone);
  } catch {
    return DEFAULT_EVENT_TIMEZONE;
  }
}
