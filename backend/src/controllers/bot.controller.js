import { env } from "../config/env.js";
import { enqueueJob } from "../services/outbound.worker.js";
import { processGuestMessage, resolveGuestForInbound } from "../services/bot/bot.service.js";
import { normalizePhone } from "../services/bot/session.service.js";

function logBot(event, extra = {}) {
  console.log("[bot]", event, extra);
}

function jidPhone(value) {
  return String(value || "")
    .split(":")[0]
    .split("@")[0];
}

function isGroupJid(value) {
  return String(value || "").endsWith("@g.us");
}

export function extractInboundMessage(payload = {}) {
  const type = String(payload.type || payload.event || "").trim();
  const normalized = payload.normalized && typeof payload.normalized === "object" ? payload.normalized : {};
  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  const fromRaw = normalized.from || data.from || payload.from || "";
  const text = String(
    normalized.content?.text || data.body || data.text || payload.text || payload.message || "",
  ).trim();
  const contentType = String(normalized.content?.type || data.type || payload.messageType || "text").toLowerCase();
  const messageId = String(normalized.messageId || payload.messageId || payload.eventId || payload.id || data.id || "").trim();
  return {
    type,
    from: jidPhone(fromRaw),
    fromRaw: String(fromRaw || ""),
    text,
    contentType,
    messageId,
    isGroup: isGroupJid(fromRaw) || isGroupJid(normalized.from),
    isInbound: /inbound|message/i.test(type) || Boolean(text || fromRaw),
  };
}

async function sendNotice({ event, guest, text }) {
  await enqueueJob("whatsapp.send", {
    to: guest.phone,
    text,
    guestId: guest.id,
    eventId: event.id,
  });
}

export async function handleInboundWhatsapp({ payload, integration }) {
  const inbound = extractInboundMessage(payload || {});
  if (!inbound.isInbound) {
    return { processed: false, reason: "ignored_event" };
  }
  if (inbound.isGroup) {
    return { processed: true, reason: "group_message_ignored" };
  }
  if (!inbound.from) {
    return { processed: false, reason: "missing_from" };
  }

  const ownerUserId = integration?.ownerUserId;
  if (!ownerUserId) {
    return { processed: false, reason: "missing_owner" };
  }

  const resolved = await resolveGuestForInbound({ ownerUserId, phone: inbound.from });
  if (!resolved?.guest || !resolved?.event) {
    logBot("guest not found", { from: inbound.from, ownerUserId });
    return { processed: true, reason: "guest_not_found" };
  }

  const { guest, event } = resolved;
  if (inbound.contentType && inbound.contentType !== "text" && !inbound.text) {
    await sendNotice({
      event,
      guest,
      text: "Por ahora solo puedo responder a mensajes de texto. Escribe tu consulta.",
    });
    return { processed: true, reason: "not_text_message", eventId: event.id, guestId: guest.id };
  }
  if (!inbound.text) {
    return { processed: true, reason: "empty_message" };
  }

  try {
    const result = await processGuestMessage({
      eventId: event.id,
      guestId: guest.id,
      text: inbound.text,
      userId: normalizePhone(guest.phone) || inbound.from,
      dryRun: false,
      persistConversation: true,
    });
    logBot("inbound processed", {
      eventId: event.id,
      guestId: guest.id,
      reason: result.skipped ? result.reason : "ai_reply",
    });
    return {
      processed: true,
      reason: result.skipped ? result.reason : "ai_reply",
      eventId: event.id,
      guestId: guest.id,
      conversationId: result.conversationId || null,
    };
  } catch (error) {
    logBot("inbound failed", {
      eventId: event.id,
      guestId: guest.id,
      message: error.message,
    });
    return {
      processed: true,
      reason: "bot_error",
      eventId: event.id,
      guestId: guest.id,
      error: error.message,
    };
  }
}

export async function postWhatsappConnectEvents(req, res, next) {
  try {
    if (!env.wc.webhookEnabled) {
      const err = new Error("Webhook de WhatsApp deshabilitado.");
      err.status = 503;
      throw err;
    }
    const result = await handleInboundWhatsapp({
      payload: req.wc?.payload || {},
      integration: req.wc?.integration || null,
    });
    res.status(202).json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
}
