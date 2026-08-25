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
  const displayPhone = resolveDisplayPhone({ fromPhone: readFromPhoneRaw(payload), channelId: chatId });
  return {
    chatId,
    displayPhone,
    isGroup: isGroupJid(chatId),
    isChannelId: isWhatsappChannelId(chatId),
  };
}

function formatMxDigits(digits) {
  if (!digits) return "";
  if (digits.length === 10) return `521${digits}`;
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
