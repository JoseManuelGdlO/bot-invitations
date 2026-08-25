import { env } from "../config/env.js";
import { enqueueJob } from "../services/outbound.worker.js";
import { processGuestMessage, rememberWhatsappChatId, resolveGuestForInbound } from "../services/bot/bot.service.js";
import { normalizePhone } from "../services/bot/session.service.js";
import { extractInboundIdentity, resolveWhatsappTo } from "../utils/whatsapp-identity.js";
import { Logger } from "../utils/logger.js";

const botLog = new Logger("Bot");

export function extractInboundMessage(payload = {}) {
  const type = String(payload.type || payload.event || "").trim();
  const normalized = payload.normalized && typeof payload.normalized === "object" ? payload.normalized : {};
  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  const identity = extractInboundIdentity(payload);
  const text = String(
    normalized.content?.text || data.body || data.text || payload.text || payload.message || "",
  ).trim();
  const contentType = String(normalized.content?.type || data.type || payload.messageType || "text").toLowerCase();
  const messageId = String(normalized.messageId || payload.messageId || payload.eventId || payload.id || data.id || "").trim();
  return {
    type,
    chatId: identity.chatId,
    displayPhone: identity.displayPhone,
    text,
    contentType,
    messageId,
    isGroup: identity.isGroup,
    isInbound: /inbound|message/i.test(type) || Boolean(text || identity.chatId),
  };
}

async function sendNotice({ event, guest, text }) {
  await enqueueJob("whatsapp.send", {
    to: resolveWhatsappTo(guest),
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
    botLog.info("inbound ignorado", { reason: "group_message_ignored" });
    return { processed: true, reason: "group_message_ignored" };
  }
  if (!inbound.chatId) {
    return { processed: false, reason: "missing_from" };
  }

  const ownerUserId = integration?.ownerUserId;
  if (!ownerUserId) {
    return { processed: false, reason: "missing_owner" };
  }

  const resolved = await resolveGuestForInbound({
    ownerUserId,
    chatId: inbound.chatId,
    displayPhone: inbound.displayPhone,
  });
  if (!resolved?.guest || !resolved?.event) {
    botLog.info("inbound ignorado", {
      reason: "guest_not_found",
      chatId: inbound.chatId,
      displayPhone: inbound.displayPhone,
      ownerUserId,
    });
    return { processed: true, reason: "guest_not_found" };
  }

  const { guest, event } = resolved;
  await rememberWhatsappChatId(guest, inbound.chatId);
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
      userId: normalizePhone(guest.phone) || inbound.displayPhone || inbound.chatId,
      dryRun: false,
      persistConversation: true,
    });
    botLog.info("inbound procesado", {
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
    botLog.error("inbound falló", {
      eventId: event.id,
      guestId: guest.id,
      error: error.message,
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
