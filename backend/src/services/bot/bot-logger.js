function clip(value, max = 240) {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function formatMeta(meta) {
  if (meta == null) return "";
  if (typeof meta !== "object") return ` ${clip(meta, 500)}`;
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return "";
  }
}

/** Logs del razonamiento del bot. Siempre llevan el prefijo [BOT] para filtrar en Docker. */
export function botLog(event, meta = null) {
  console.log(`[BOT] ${event}${formatMeta(meta)}`);
}

export function botWarn(event, meta = null) {
  console.warn(`[BOT] ${event}${formatMeta(meta)}`);
}

export function botError(event, meta = null) {
  console.error(`[BOT] ${event}${formatMeta(meta)}`);
}

export function botTurnContext({ event, guest, message, dryRun, persistConversation, userId }) {
  return {
    eventId: event?.id,
    eventSlug: event?.slug,
    guestId: guest?.id,
    guest: guest?.rep,
    guestStatus: guest?.status,
    dryRun: Boolean(dryRun),
    persistConversation: Boolean(persistConversation),
    userId: userId || null,
    message: clip(message, 180),
  };
}

export function botTurnResult({ intent, reply, tools = [], logs = [], skipped, locked, reason }) {
  return {
    intent: intent || null,
    reply: clip(reply, 180),
    tools: tools.map((t) => t.name).filter(Boolean),
    logs: logs.map((l) => `${l.kind}:${l.value || l.label}`),
    skipped: Boolean(skipped),
    locked: Boolean(locked),
    reason: reason || null,
  };
}
