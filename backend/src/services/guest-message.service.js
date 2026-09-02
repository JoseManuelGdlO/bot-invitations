import { Conversation, Message } from "../models/index.js";
import { formatClock } from "../utils/time.js";
import { enqueueJob } from "./outbound.worker.js";
import { appendOutboundToSession } from "./bot/bot.service.js";
import { resolveWhatsappTo } from "../utils/whatsapp-identity.js";

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
  guestPatch = {},
}) {
  const body = String(text || "").trim();
  if (!body) return null;

  Object.assign(guest, guestPatch);
  guest.lastMessage = body.slice(0, 80);
  await guest.save();

  let conv = await Conversation.findOne({ where: { guestId: guest.id } });
  if (!conv) {
    conv = await Conversation.create({
      eventId: event.id,
      guestId: guest.id,
      aiPaused: false,
      unread: 0,
    });
  }
  await Message.create({
    conversationId: conv.id,
    from: "ai",
    text: body,
    at: formatClock(),
  });
  await enqueueJob("whatsapp.send", {
    to: resolveWhatsappTo(guest),
    text: body,
    guestId: guest.id,
    eventId: event.id,
    conversationId: conv.id,
    kind,
    followUpId,
    ...(campaignId ? { campaignId } : {}),
    ...(Array.isArray(hsmParams) && hsmParams.length ? { hsmParams } : {}),
    ...(hsmTemplateName ? { hsmTemplateName } : {}),
    ...(hsmHeaderDocument ? { hsmHeaderDocument } : {}),
  });
  await appendOutboundToSession({ event, guest, text: body });
  return conv;
}
