import {
  Conversation,
  Event,
  Guest,
  Message,
} from "../models/index.js";
import { asyncHandler } from "../utils/async.js";
import { formatClock } from "../utils/time.js";
import { serializeConversation, serializeMessage } from "../utils/serialize.js";
import { requireEvent, userEventIds, requirePermission, PERMS } from "../services/access.service.js";
import { enqueueJob } from "../services/outbound.worker.js";
import { assertCanSendInvitations } from "../services/plans.service.js";
import { appendOutboundToSession } from "../services/bot/bot.service.js";
import { resolveWhatsappTo } from "../utils/whatsapp-identity.js";
import { getEventCampaignSnapshot, planCampaign } from "../services/campaign.service.js";
import { Logger } from "../utils/logger.js";

const log = new Logger("WhatsApp");

async function accessibleConversation(userId, conversationId) {
  const ids = await userEventIds(userId);
  const conv = await Conversation.findOne({ where: { id: conversationId, eventId: ids } });
  if (!conv) return null;
  const event = await Event.findByPk(conv.eventId);
  return { conv, event };
}

export const listConversations = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  if (!(await requirePermission(req, res, event, PERMS.VIEW_CHATS))) return;
  const conversations = await Conversation.findAll({
    where: { eventId: event.id },
    include: [{ model: Message, as: "messages" }],
    order: [[{ model: Message, as: "messages" }, "createdAt", "ASC"]],
  });
  res.json(conversations.map((c) => serializeConversation(c, event.slug, c.messages || [])));
});

export const toggleConversation = asyncHandler(async (req, res) => {
  const found = await accessibleConversation(req.user.id, req.params.conversationId);
  if (!found) return res.status(404).json({ error: "Conversación no encontrada." });
  if (!(await requirePermission(req, res, found.event, PERMS.REPLY))) return;
  if (req.body?.aiPaused !== undefined) found.conv.aiPaused = !!req.body.aiPaused;
  if (req.body?.unread !== undefined) found.conv.unread = Number(req.body.unread) || 0;
  await found.conv.save();
  const messages = await Message.findAll({
    where: { conversationId: found.conv.id },
    order: [["createdAt", "ASC"]],
  });
  res.json(serializeConversation(found.conv, found.event.slug, messages));
});

export const sendMessage = asyncHandler(async (req, res) => {
  const found = await accessibleConversation(req.user.id, req.params.conversationId);
  if (!found) return res.status(404).json({ error: "Conversación no encontrada." });
  if (!(await requirePermission(req, res, found.event, PERMS.REPLY))) return;
  assertCanSendInvitations(req.user);
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "El mensaje no puede estar vacío." });
  const from = found.conv.aiPaused ? "planner" : req.body?.from || "planner";
  const message = await Message.create({
    conversationId: found.conv.id,
    from: ["ai", "guest", "planner"].includes(from) ? from : "planner",
    text,
    at: formatClock(undefined, found.event.timezone),
  });
  found.conv.unread = 0;
  await found.conv.save();
  const guest = await Guest.findByPk(found.conv.guestId);
  if (guest && from !== "guest") {
    guest.lastMessage = text.slice(0, 80);
    await guest.save();
    await enqueueJob("whatsapp.send", {
      to: resolveWhatsappTo(guest),
      text,
      guestId: guest.id,
      eventId: found.event.id,
      conversationId: found.conv.id,
    });
    await appendOutboundToSession({ event: found.event, guest, text });
  }
  res.status(201).json(serializeMessage(message));
});

export const getCurrentCampaign = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  if (!(await requirePermission(req, res, event, PERMS.REPLY))) return;
  res.json(await getEventCampaignSnapshot(event));
});

export const launchCampaign = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  if (!(await requirePermission(req, res, event, PERMS.REPLY))) return;
  assertCanSendInvitations(req.user);
  log.info("planificando campaña", { eventId: event.id, mode: req.body?.mode || "now" });
  try {
    const campaign = await planCampaign(event, req.body || {});
    res.json(campaign);
  } catch (err) {
    if (err.status === 409) {
      return res.status(409).json({ error: err.message, campaign: err.campaign });
    }
    throw err;
  }
});
