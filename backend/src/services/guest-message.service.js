import { Conversation, Message } from "../models/index.js";
import { formatClock } from "../utils/time.js";
import { httpError } from "../utils/http-error.js";
import { enqueueJob } from "./outbound.worker.js";
import { appendOutboundToSession } from "./bot/bot.service.js";
import { createWhatsAppProvider } from "./whatsapp.adapter.js";
import { resolveWhatsappTo } from "../utils/whatsapp-identity.js";

export function resolveOutboundMessageKind({
  kind = "message",
  hsmParams = null,
  hsmTemplateName = null,
  hsmHeaderDocument = null,
  hsmHeaderImage = null,
} = {}) {
  if (
    hsmTemplateName ||
    hsmHeaderDocument ||
    hsmHeaderImage ||
    kind === "campaign" ||
    kind === "template"
  ) {
    return "template";
  }
  if (kind === "message") return null;
  return kind;
}

async function ensureConversation(event, guest) {
  let conv = await Conversation.findOne({ where: { guestId: guest.id } });
  if (!conv) {
    conv = await Conversation.create({
      eventId: event.id,
      guestId: guest.id,
      aiPaused: false,
      unread: 0,
    });
  }
  return conv;
}

export async function applyGuestOutboundPatch(guest, { text, guestPatch = {} }) {
  Object.assign(guest, guestPatch || {});
  guest.lastMessage = String(text || "").slice(0, 80);
  await guest.save();
}

export async function persistOutboundConversationMessage({
  conversationId,
  text,
  from = "ai",
  messageKind = null,
  timezone,
  providerId = null,
}) {
  return Message.create({
    conversationId,
    from: ["ai", "guest", "planner"].includes(from) ? from : "ai",
    text,
    at: formatClock(undefined, timezone),
    ...(messageKind ? { kind: messageKind } : {}),
    ...(providerId ? { providerId } : {}),
  });
}

export async function deliverAiMessage({
  event,
  guest,
  text,
  kind = "message",
  followUpId = null,
  campaignId = null,
  hsmParams = null,
  hsmTemplateName = null,
  hsmHeaderDocument = null,
  hsmHeaderImage = null,
  guestPatch = {},
  sync = false,
}) {
  const body = String(text || "").trim();
  if (!body) return null;

  const conv = await ensureConversation(event, guest);
  const messageKind = resolveOutboundMessageKind({
    kind,
    hsmParams,
    hsmTemplateName,
    hsmHeaderDocument,
    hsmHeaderImage,
  });
  const to = resolveWhatsappTo(guest);
  const providerMeta = {
    eventId: event.id,
    guestId: guest.id,
    conversationId: conv.id,
    kind,
    ...(Array.isArray(hsmParams) && hsmParams.length ? { hsmParams } : {}),
    ...(hsmTemplateName ? { hsmTemplateName } : {}),
    ...(hsmHeaderDocument ? { hsmHeaderDocument } : {}),
    ...(hsmHeaderImage ? { hsmHeaderImage } : {}),
  };

  if (sync) {
    const provider = createWhatsAppProvider();
    const result = await provider.sendMessage(to, body, providerMeta);
    if (result?.skipped) {
      throw httpError(502, "No se pudo enviar el mensaje por WhatsApp.");
    }
    await applyGuestOutboundPatch(guest, { text: body, guestPatch });
    await persistOutboundConversationMessage({
      conversationId: conv.id,
      text: body,
      from: "ai",
      messageKind,
      timezone: event.timezone,
      providerId: result?.providerId || null,
    });
    await appendOutboundToSession({ event, guest, text: body });
    return conv;
  }

  await enqueueJob("whatsapp.send", {
    to,
    text: body,
    guestId: guest.id,
    eventId: event.id,
    conversationId: conv.id,
    kind,
    followUpId,
    persistMessage: true,
    appendToSession: true,
    messageFrom: "ai",
    messageKind,
    timezone: event.timezone,
    ...(guestPatch && Object.keys(guestPatch).length ? { guestPatch } : {}),
    ...(campaignId ? { campaignId } : {}),
    ...(Array.isArray(hsmParams) && hsmParams.length ? { hsmParams } : {}),
    ...(hsmTemplateName ? { hsmTemplateName } : {}),
    ...(hsmHeaderDocument ? { hsmHeaderDocument } : {}),
    ...(hsmHeaderImage ? { hsmHeaderImage } : {}),
  });
  return conv;
}
