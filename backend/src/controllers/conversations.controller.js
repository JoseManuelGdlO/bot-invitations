import {
  AiConfig,
  Conversation,
  Event,
  Guest,
  Message,
} from "../models/index.js";
import { asyncHandler } from "../utils/async.js";
import { formatClock } from "../utils/time.js";
import { applyTemplate } from "../utils/defaults.js";
import { serializeConversation, serializeGuest, serializeMessage } from "../utils/serialize.js";
import { requireEvent, userEventIds } from "../services/access.service.js";
import { enqueueJob } from "../services/outbound.worker.js";
import { logActivity } from "../services/activity.service.js";
import { assertCanSendInvitations } from "../services/plans.service.js";

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
  assertCanSendInvitations(req.user);
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "El mensaje no puede estar vacío." });
  const from = found.conv.aiPaused ? "planner" : req.body?.from || "planner";
  const message = await Message.create({
    conversationId: found.conv.id,
    from: ["ai", "guest", "planner"].includes(from) ? from : "planner",
    text,
    at: formatClock(),
  });
  found.conv.unread = 0;
  await found.conv.save();
  const guest = await Guest.findByPk(found.conv.guestId);
  if (guest && from !== "guest") {
    guest.lastMessage = text.slice(0, 80);
    await guest.save();
    await enqueueJob("whatsapp.send", {
      to: guest.phone,
      text,
      guestId: guest.id,
      eventId: found.event.id,
      conversationId: found.conv.id,
    });
  }
  res.status(201).json(serializeMessage(message));
});

export const launchCampaign = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  assertCanSendInvitations(req.user);
  const ai = await AiConfig.findOne({ where: { eventId: event.id } });
  const guests = await Guest.findAll({ where: { eventId: event.id, status: "sin_contactar" } });
  const now = new Date();
  for (const guest of guests) {
    const text = applyTemplate(ai?.openingMessage || "Hola {{nombre}}, ¿podrán acompañarnos?", {
      nombre: guest.rep.split(" ")[0] || guest.rep,
      numero_invitados: String(guest.invited),
      evento: event.name,
      fecha: event.date,
      lugar: event.venue,
      hora: event.time,
      planner: req.user.name,
    });
    guest.status = "enviado";
    guest.whatsapp = "enviado";
    guest.lastMessage = "Mensaje inicial · hoy";
    guest.contactedAt = now;
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
      text,
      at: formatClock(now),
    });
    await enqueueJob("whatsapp.send", {
      to: guest.phone,
      text,
      guestId: guest.id,
      eventId: event.id,
      conversationId: conv.id,
    });
  }
  await logActivity(event.id, `${ai?.assistantName || "El asistente"} envió ${guests.length} mensajes iniciales`, "message");
  const updated = await Guest.findAll({ where: { eventId: event.id } });
  res.json({ launched: guests.length, guests: updated.map((g) => serializeGuest(g, event.slug)) });
});
