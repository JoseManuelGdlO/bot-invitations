const CHANNEL_ID_SUFFIX_RE = /@(lid|s\.whatsapp\.net|g\.us)$/i;

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export function isWhatsappChannelId(value) {
  const v = String(value || "").trim();
  if (!v) return false;
  return CHANNEL_ID_SUFFIX_RE.test(v);
}

export function isGroupJid(value) {
  return String(value || "").trim().toLowerCase().endsWith("@g.us");
}

export function normalizeDisplayPhone(value) {
  const compact = String(value || "")
    .trim()
    .replace(/\s/g, "");
  if (!compact || isWhatsappChannelId(compact)) return null;
  const digits = compact.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return compact.startsWith("+") ? `+${digits}` : digits;
}

export function extractDisplayPhoneFromChannelId(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  if (/@lid$/i.test(v) || /@g\.us$/i.test(v)) return null;
  if (/@s\.whatsapp\.net$/i.test(v)) {
    const local = v.replace(/@s\.whatsapp\.net$/i, "").split(":")[0];
    return normalizeDisplayPhone(local);
  }
  return null;
}

export function resolveDisplayPhone({ fromPhone, channelId } = {}) {
  const fromPhoneNorm = normalizeDisplayPhone(fromPhone);
  if (fromPhoneNorm) return fromPhoneNorm;
  return extractDisplayPhoneFromChannelId(channelId);
}

export function readChatId(payload = {}) {
  const normalized = asObject(payload.normalized);
  const data = asObject(payload.data);
  const message = asObject(payload.message);
  const raw = asObject(payload.raw);
  return String(
    normalized.from || data.from || payload.from || message.from || raw.key?.remoteJid || "",
  ).trim();
}

export function readFromPhoneRaw(payload = {}) {
  const normalized = asObject(payload.normalized);
  const data = asObject(payload.data);
  const message = asObject(payload.message);
  return String(
    normalized.fromPhone ||
      normalized.displayPhone ||
      payload.fromPhone ||
      payload.displayPhone ||
      data.fromPhone ||
      data.displayPhone ||
      message.fromPhone ||
      message.displayPhone ||
      "",
  ).trim();
}

export function extractInboundIdentity(payload = {}) {
  const chatId = readChatId(payload);
  const displayPhone =
    resolveDisplayPhone({ fromPhone: readFromPhoneRaw(payload), channelId: chatId }) ||
    normalizeWaIdTo10(chatId) ||
    null;
  return {
    chatId,
    displayPhone,
    isGroup: isGroupJid(chatId),
    isChannelId: isWhatsappChannelId(chatId),
  };
}

const NATIONAL_DIGITS = 10;
const MAX_PHONE_DIGITS = 15;

/** Últimos 10 dígitos del wa_id / teléfono (p. ej. 5216183218624 → 6183218624). */
export function normalizeWaIdTo10(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length <= NATIONAL_DIGITS ? digits : digits.slice(-NATIONAL_DIGITS);
}

/**
 * Teléfono de invitado: 10 dígitos locales, o lada + 10 (hasta 15).
 * Vacío si no cumple.
 */
export function normalizeGuestPhoneDigits(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === NATIONAL_DIGITS) return digits;
  if (digits.length > NATIONAL_DIGITS && digits.length <= MAX_PHONE_DIGITS) return digits;
  return "";
}

function formatMxDigits(digits) {
  if (!digits) return "";
  if (digits.length === NATIONAL_DIGITS && !digits.startsWith("1")) return `521${digits}`;
  if (digits.length > NATIONAL_DIGITS && digits.length <= MAX_PHONE_DIGITS) return digits;
  return digits;
}

/**
 * Destinatario Graph, sin + ni JID.
 * 10 dígitos que no empiezan con 1 se envían como México (521 + local).
 * Si empiezan con 1, o hay más de 10, esa cifra inicial es la lada.
 */
export function formatWhatsappGraphTo(value) {
  const digits = normalizeGuestPhoneDigits(value);
  if (!digits) return "";
  if (digits.length === NATIONAL_DIGITS && !digits.startsWith("1")) return `521${digits}`;
  return digits;
}

export function formatWhatsappTo(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/@lid$/i.test(raw) || /@g\.us$/i.test(raw)) return raw;
  if (/@s\.whatsapp\.net$/i.test(raw)) {
    const local = raw.replace(/@s\.whatsapp\.net$/i, "").split(":")[0];
    const formatted = formatMxDigits(local.replace(/\D/g, ""));
    if (!formatted) return raw;
    return `${formatted}@s.whatsapp.net`;
  }
  if (raw.includes("@")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  return formatMxDigits(digits);
}

export function resolveWhatsappTo(guest) {
  const chatId = String(guest?.whatsappChatId || "").trim();
  if (chatId) return formatWhatsappTo(chatId);
  return formatWhatsappTo(guest?.phone);
}

export function shouldPersistWhatsappChatId(chatId) {
  return String(chatId || "").trim().includes("@");
}
