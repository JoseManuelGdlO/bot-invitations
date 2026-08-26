import { asyncHandler } from "../utils/async.js";
import { Conversation, Event, Guest, Message } from "../models/index.js";
import { requireEvent, userEventIds } from "../services/access.service.js";
import { appendOutboundToSession, processGuestMessage } from "../services/bot/bot.service.js";
import {
  deleteBotSession,
  getBotSession,
  playgroundUserId,
  asItems,
} from "../services/bot/session.service.js";
import { itemsToChat } from "../services/bot/openai.service.js";
import { buildInstructions, loadEventBotContext } from "../services/bot/prompt.service.js";
import { resolveOpeningText } from "../services/templates.service.js";
import { botLog } from "../services/bot/bot-logger.js";
import { serializeConversation, serializeMessage } from "../utils/serialize.js";

/** Igual que una campaña real: el playground arranca con la plantilla de Primer contacto ya “enviada”. */
async function ensurePlaygroundOpening(event, guest, userId) {
  const existing = await getBotSession({ eventId: event.id, guestId: guest.id, userId });
  const items = asItems(existing?.items);
  if (items.length > 0) return items;

  const ctx = await loadEventBotContext(event, guest);
  const opening = await resolveOpeningText(event, guest, ctx.plannerName, ctx.ai?.openingMessage);
  botLog("playground invitación inicial", {
    eventId: event.id,
    guestId: guest.id,
    preview: opening.slice(0, 120),
  });
  const session = await appendOutboundToSession({ event, guest, text: opening, userId });
  return asItems(session.items);
}

export const status = asyncHandler(async (_req, res) => {
  res.json({ enabled: true });
});

export const getPromptPreview = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  const guestId = String(req.query.guestId || "").trim();
  let guest = null;
  if (guestId) {
    guest = await Guest.findOne({ where: { id: guestId, eventId: event.id } });
    if (!guest) return res.status(404).json({ error: "Invitado no encontrado." });
  } else {
    guest = await Guest.findOne({ where: { eventId: event.id }, order: [["createdAt", "ASC"]] });
  }
  if (!guest) {
    return res.status(400).json({ error: "Agrega un invitado para previsualizar el prompt." });
  }
  const ctx = await loadEventBotContext(event, guest);
  const instructions = buildInstructions({
    event,
    guest,
    ai: ctx.ai,
    templates: ctx.templates,
    faqs: ctx.faqs,
    vars: ctx.vars,
  });
  res.json({
    ok: true,
    eventId: event.slug,
    guestId: guest.id,
    guestName: guest.rep,
    instructions,
  });
});

export const getPlayground = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  const guestId = String(req.query.guestId || "").trim();
  if (!guestId) return res.status(400).json({ error: "guestId es requerido." });
  const guest = await Guest.findOne({ where: { id: guestId, eventId: event.id } });
  if (!guest) return res.status(404).json({ error: "Invitado no encontrado." });
  const userId = playgroundUserId(event.id, guest.id);
  const items = await ensurePlaygroundOpening(event, guest, userId);
  res.json({
    ok: true,
    eventId: event.slug,
    guestId: guest.id,
    userId,
    items,
    messages: itemsToChat(items),
  });
});

export const postPlayground = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  const guestId = String(req.body?.guestId || "").trim();
  const message = String(req.body?.message || "").trim();
  const reset = Boolean(req.body?.reset);
  if (!guestId) return res.status(400).json({ error: "guestId es requerido." });
  const guest = await Guest.findOne({ where: { id: guestId, eventId: event.id } });
  if (!guest) return res.status(404).json({ error: "Invitado no encontrado." });
  const userId = playgroundUserId(event.id, guest.id);
  if (reset) {
    await deleteBotSession({ eventId: event.id, guestId: guest.id, userId });
    botLog("playground reiniciado", { eventId: event.id, guestId: guest.id });
    if (!message) {
      const items = await ensurePlaygroundOpening(event, guest, userId);
      return res.json({ ok: true, reply: null, messages: itemsToChat(items) });
    }
  }
  if (!message) return res.status(400).json({ error: "message es requerido." });
  await ensurePlaygroundOpening(event, guest, userId);
  const result = await processGuestMessage({
    eventId: event.id,
    guestId: guest.id,
    text: message,
    userId,
    dryRun: true,
    persistConversation: false,
  });
  res.json({
    ok: true,
    reply: result.reply,
    locked: Boolean(result.locked),
    skipped: Boolean(result.skipped),
    reason: result.reason || null,
    intent: result.intent || null,
    logs: result.logs || [],
    tools: result.tools || [],
    messages: itemsToChat(result.items || []),
  });
});

async function accessibleConversation(userId, conversationId) {
  const ids = await userEventIds(userId);
  const conv = await Conversation.findOne({ where: { id: conversationId, eventId: ids } });
  if (!conv) return null;
  const event = await Event.findByPk(conv.eventId);
  return { conv, event };
}

export const simulateGuest = asyncHandler(async (req, res) => {
  const found = await accessibleConversation(req.user.id, req.params.conversationId);
  if (!found) return res.status(404).json({ error: "Conversación no encontrada." });
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "El mensaje no puede estar vacío." });
  const result = await processGuestMessage({
    eventId: found.event.id,
    guestId: found.conv.guestId,
    text,
    dryRun: true,
    persistConversation: true,
  });
  const messages = await Message.findAll({
    where: { conversationId: found.conv.id },
    order: [["createdAt", "ASC"]],
  });
  await found.conv.reload();
  res.json({
    ok: true,
    reply: result.reply,
    skipped: Boolean(result.skipped),
    reason: result.reason || null,
    locked: Boolean(result.locked),
    conversation: serializeConversation(found.conv, found.event.slug, messages),
    lastMessages: messages.slice(-2).map(serializeMessage),
  });
});
