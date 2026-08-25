import { Conversation, Event, Guest, Message } from "../../models/index.js";
import { formatClock } from "../../utils/time.js";
import { httpError } from "../../utils/http-error.js";
import { enqueueJob } from "../outbound.worker.js";
import { buildInstructions, loadEventBotContext } from "./prompt.service.js";
import { processTurn } from "./openai.service.js";
import { executeBotTool } from "./tools.js";
import {
  appendSessionItems,
  asItems,
  getOrCreateBotSession,
  liveUserId,
  phonesMatch,
  refreshBotSessionLock,
  saveSessionItems,
  tryLockBotSession,
  unlockBotSession,
} from "./session.service.js";

async function getOrCreateConversation(event, guest) {
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

function markGuestReplied(guest, text) {
  const previous = guest.status;
  guest.lastReply = String(text || "").slice(0, 240);
  guest.lastReplyAt = formatClock();
  guest.whatsapp = "respondido";
  if (["sin_contactar", "enviado", "entregado", "sin_respuesta", "respondio"].includes(previous)) {
    guest.status = "en_conversacion";
  }
}

export async function appendOutboundToSession({ event, guest, text, userId }) {
  const session = await getOrCreateBotSession({
    eventId: event.id,
    guestId: guest.id,
    userId: userId || liveUserId(guest),
  });
  await appendSessionItems(session, [{ type: "message", role: "assistant", content: text }]);
  return session;
}

export async function resolveGuestForInbound({ ownerUserId, phone }) {
  const events = await Event.findAll({ where: { ownerId: ownerUserId } });
  if (!events.length) return null;
  const eventById = new Map(events.map((event) => [event.id, event]));
  const guests = await Guest.findAll({ where: { eventId: events.map((event) => event.id) } });
  const matches = guests.filter((guest) => phonesMatch(guest.phone, phone));
  if (!matches.length) return null;
  if (matches.length === 1) {
    return { guest: matches[0], event: eventById.get(matches[0].eventId) };
  }

  const convs = await Conversation.findAll({
    where: { guestId: matches.map((guest) => guest.id) },
    order: [["updatedAt", "DESC"]],
  });
  if (convs.length) {
    const guest = matches.find((row) => row.id === convs[0].guestId);
    if (guest) return { guest, event: eventById.get(guest.eventId) };
  }

  const ranked = [...matches].sort((a, b) => {
    const eventA = eventById.get(a.eventId);
    const eventB = eventById.get(b.eventId);
    const activeA = eventA?.status === "activo" ? 0 : 1;
    const activeB = eventB?.status === "activo" ? 0 : 1;
    if (activeA !== activeB) return activeA - activeB;
    return String(eventA?.date || "").localeCompare(String(eventB?.date || ""));
  });
  const guest = ranked[0];
  return { guest, event: eventById.get(guest.eventId) };
}

export async function processGuestMessage({
  eventId,
  guestId,
  text,
  userId,
  dryRun = false,
  persistConversation = true,
}) {
  const message = String(text || "").trim();
  if (!message) throw httpError(400, "El mensaje no puede estar vacío.");

  const event = await Event.findByPk(eventId);
  const guest = await Guest.findOne({ where: { id: guestId, eventId } });
  if (!event || !guest) throw httpError(404, "Evento o invitado no encontrado.");

  const sessionUserId = userId || liveUserId(guest);
  const conv = persistConversation
    ? await getOrCreateConversation(event, guest)
    : await Conversation.findOne({ where: { guestId: guest.id } });

  const session = await getOrCreateBotSession({
    eventId: event.id,
    guestId: guest.id,
    userId: sessionUserId,
  });
  if (asItems(session.items).length === 0 && conv?.id) {
    const history = await Message.findAll({
      where: { conversationId: conv.id },
      order: [["createdAt", "ASC"]],
      limit: 40,
    });
    session.items = history.map((row) => ({
      type: "message",
      role: row.from === "guest" ? "user" : "assistant",
      content: row.text,
    }));
    session.changed("items", true);
    await session.save();
  }

  if (persistConversation) {
    await Message.create({
      conversationId: conv.id,
      from: "guest",
      text: message,
      at: formatClock(),
    });
    markGuestReplied(guest, message);
    conv.unread = (conv.unread || 0) + 1;
    await conv.save();
    await guest.save();
  }

  if (persistConversation && conv?.aiPaused) {
    return { skipped: true, reason: "ai_paused", reply: null, conversationId: conv.id };
  }
  const locked = await tryLockBotSession(session);
  if (!locked) {
    const wait = "Por favor espera a que termine la respuesta anterior.";
    if (persistConversation) {
      await Message.create({
        conversationId: conv.id,
        from: "ai",
        text: wait,
        at: formatClock(),
      });
    }
    return { skipped: false, locked: true, reply: wait, conversationId: conv?.id || null };
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

  const items = asItems(session.items);
  items.push({ type: "message", role: "user", content: message });

  try {
    const result = await processTurn({
      instructions,
      items,
      executeTool: (call) => executeBotTool(call, { guest, event }),
      refreshLock: () => refreshBotSessionLock(session),
    });
    await saveSessionItems(session, result.items);
    await guest.reload();

    if (persistConversation) {
      await Message.create({
        conversationId: conv.id,
        from: "ai",
        text: result.reply,
        at: formatClock(),
      });
      guest.lastMessage = String(result.reply || "").slice(0, 80);
      await guest.save();
    }

    if (!dryRun && persistConversation) {
      await enqueueJob("whatsapp.send", {
        to: guest.phone,
        text: result.reply,
        guestId: guest.id,
        eventId: event.id,
        conversationId: conv.id,
      });
    }

    return {
      skipped: false,
      locked: false,
      reply: result.reply,
      tools: result.tools || [],
      conversationId: conv?.id || null,
      items: result.items,
    };
  } catch (error) {
    try {
      await saveSessionItems(session, items);
    } catch (saveError) {
      console.error("[bot] no se pudo persistir la sesión:", saveError.message);
    }
    throw error;
  } finally {
    try {
      await unlockBotSession(session);
    } catch (unlockError) {
      console.error("[bot] no se pudo liberar lock:", unlockError.message);
    }
  }
}
