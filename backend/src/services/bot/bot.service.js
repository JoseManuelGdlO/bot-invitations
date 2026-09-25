import { AiConfig, Conversation, Event, Guest, Message } from "../../models/index.js";
import { Op } from "sequelize";
import { env } from "../../config/env.js";
import { formatClock } from "../../utils/time.js";
import { httpError } from "../../utils/http-error.js";
import { normalizeWaIdTo10, resolveWhatsappTo, shouldPersistWhatsappChatId } from "../../utils/whatsapp-identity.js";
import { createWhatsAppProvider } from "../whatsapp.adapter.js";
import { buildInstructions, loadEventBotContext } from "./prompt.service.js";
import { processTurn } from "./openai.service.js";
import { executeBotTool } from "./tools.js";
import { botError, botLog, botTurnContext, botTurnResult, botWarn } from "./bot-logger.js";
import { armFlush, inboundBufferKey, pushPending } from "./inbound-buffer.js";
import {
  appendSessionItems,
  asItems,
  getOrCreateBotSession,
  liveUserId,
  refreshBotSessionLock,
  saveSessionItems,
  tryLockBotSession,
  unlockBotSession,
} from "./session.service.js";

export { resetInboundBuffers } from "./inbound-buffer.js";

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

function markGuestReplied(guest, text, timeZone) {
  const previous = guest.status;
  guest.lastReply = String(text || "").slice(0, 240);
  guest.lastReplyAt = formatClock(undefined, timeZone);
  guest.whatsapp = "respondido";
  if (["sin_contactar", "enviado", "entregado"].includes(previous)) {
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

async function pickGuestFromMatches(matches, eventById) {
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

export async function resolveGuestForInbound({ ownerUserId, chatId, displayPhone }) {
  const inboundChatId = String(chatId || "").trim();
  const digits = normalizeWaIdTo10(displayPhone || inboundChatId);
  if (!digits && !inboundChatId.includes("@")) return null;

  const where = inboundChatId.includes("@")
    ? { [Op.or]: [{ phoneDigits: digits }, { whatsappChatId: inboundChatId }] }
    : { phoneDigits: digits };

  const rows = await Guest.findAll({
    where,
    include: [{
      model: Event,
      required: true,
      where: {
        status: "activo",
        ...(ownerUserId ? { ownerId: ownerUserId } : {}),
      },
    }],
  });
  if (!rows.length) return null;

  const eventById = new Map(
    rows.map((guest) => [guest.eventId, guest.Event || guest.event]),
  );
  return pickGuestFromMatches(rows, eventById);
}

export async function rememberWhatsappChatId(guest, chatId) {
  if (!guest || !shouldPersistWhatsappChatId(chatId)) return guest;
  const next = String(chatId).trim();
  if (String(guest.whatsappChatId || "").trim() === next) return guest;
  guest.whatsappChatId = next;
  await guest.save();
  return guest;
}

function historyWithoutTrailingGuest(rows) {
  let end = rows.length;
  while (end > 0 && rows[end - 1].from === "guest") end -= 1;
  return rows.slice(0, end).map((row) => ({
    type: "message",
    role: row.from === "guest" ? "user" : "assistant",
    content: row.text,
  }));
}

async function hydrateSessionIfEmpty(session, conv) {
  if (asItems(session.items).length > 0 || !conv?.id) return;
  const history = await Message.findAll({
    where: { conversationId: conv.id },
    order: [["createdAt", "ASC"]],
    limit: 40,
  });
  session.items = historyWithoutTrailingGuest(history);
  session.changed("items", true);
  await session.save();
}

async function runGuestTurn({
  event,
  guest,
  session,
  conv,
  combinedText,
  dryRun,
  persistConversation,
  sessionUserId,
}) {
  const locked = await tryLockBotSession(session);
  if (!locked) {
    botWarn(
      "turn diferido: sesión ocupada",
      botTurnContext({ event, guest, message: combinedText, dryRun, persistConversation, userId: sessionUserId }),
    );
    return { deferred: true };
  }

  await hydrateSessionIfEmpty(session, conv);
  if (typeof guest.reload === "function") {
    await guest.reload();
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
  items.push({ type: "message", role: "user", content: combinedText });

  botLog(
    "turn inicio",
    botTurnContext({ event, guest, message: combinedText, dryRun, persistConversation, userId: sessionUserId }),
  );

  try {
    const result = await processTurn({
      instructions,
      items,
      executeTool: (call) =>
        executeBotTool(call, { guest, event, ai: ctx.ai, plannerName: ctx.plannerName, dryRun }),
      refreshLock: () => refreshBotSessionLock(session),
      context: { event, guest, dryRun, windowOpen: true },
    });
    await saveSessionItems(session, result.items);
    if (typeof guest.reload === "function") {
      await guest.reload();
    }

    botLog("turn completado", botTurnResult(result));

    if (!dryRun && persistConversation) {
      try {
        const provider = createWhatsAppProvider();
        const waResult = await provider.sendMessage(resolveWhatsappTo(guest), result.reply, {
          eventId: event.id,
          guestId: guest.id,
          conversationId: conv.id,
          kind: "message",
          forceSession: true,
        });
        if (waResult?.skipped) {
          botWarn("whatsapp omitido tras turn", {
            ...botTurnContext({ event, guest, message: combinedText, dryRun, persistConversation, userId: sessionUserId }),
            reason: "provider skipped",
          });
        } else {
          guest.lastMessage = String(result.reply || "").slice(0, 80);
          await guest.save();
          await Message.create({
            conversationId: conv.id,
            from: "ai",
            text: result.reply,
            at: formatClock(undefined, event.timezone),
            ...(waResult?.providerId ? { providerId: waResult.providerId } : {}),
          });
        }
      } catch (sendError) {
        botError("whatsapp falló tras turn", {
          ...botTurnContext({ event, guest, message: combinedText, dryRun, persistConversation, userId: sessionUserId }),
          error: sendError.message,
        });
      }
    }

    return {
      skipped: false,
      locked: false,
      queued: false,
      reply: result.reply,
      intent: result.intent || null,
      logs: result.logs || [],
      tools: result.tools || [],
      conversationId: conv?.id || null,
      items: result.items,
    };
  } catch (error) {
    botError("turn falló", {
      ...botTurnContext({ event, guest, message: combinedText, dryRun, persistConversation, userId: sessionUserId }),
      error: error.message,
    });
    try {
      await saveSessionItems(session, items);
    } catch (saveError) {
      botError("no se pudo persistir la sesión", { error: saveError.message });
    }
    throw error;
  } finally {
    try {
      await unlockBotSession(session);
    } catch (unlockError) {
      botError("no se pudo liberar lock", { error: unlockError.message });
    }
  }
}

export async function processGuestMessage({
  eventId,
  guestId,
  text,
  userId,
  dryRun = false,
  persistConversation = true,
  awaitTurn = true,
  debounceMs,
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

  if (persistConversation) {
    await Message.create({
      conversationId: conv.id,
      from: "guest",
      text: message,
      at: formatClock(undefined, event.timezone),
    });
    markGuestReplied(guest, message, event.timezone);
    conv.unread = (conv.unread || 0) + 1;
    await conv.save();
    await guest.save();
  }

  if (persistConversation && conv?.aiPaused) {
    botWarn("turn omitido: asistente pausado", botTurnContext({ event, guest, message, dryRun, persistConversation, userId: sessionUserId }));
    return { skipped: true, reason: "ai_paused", reply: null, conversationId: conv.id };
  }

  if (persistConversation) {
    const ai = await AiConfig.findOne({
      where: { eventId: event.id },
      attributes: ["botEnabled"],
    });
    if (ai?.botEnabled === false) {
      botWarn(
        "turn omitido: bot del evento apagado",
        botTurnContext({ event, guest, message, dryRun, persistConversation, userId: sessionUserId }),
      );
      return { skipped: true, reason: "bot_disabled", reply: null, conversationId: conv.id };
    }
  }

  const liveDebounce = persistConversation && !dryRun;
  const delay = liveDebounce
    ? Number.isFinite(Number(debounceMs))
      ? Math.max(0, Number(debounceMs))
      : env.botInboundDebounceMs
    : 0;
  const key = inboundBufferKey(event.id, guest.id);
  pushPending(key, message);
  const flushPromise = armFlush(key, {
    delayMs: delay,
    debounceMs: delay,
    flushFn: (combined) =>
      runGuestTurn({
        event,
        guest,
        session,
        conv,
        combinedText: combined,
        dryRun,
        persistConversation,
        sessionUserId,
      }),
  });

  if (!awaitTurn) {
    flushPromise.catch((error) => {
      botError("turn en cola falló", {
        ...botTurnContext({ event, guest, message, dryRun, persistConversation, userId: sessionUserId }),
        error: error.message,
      });
    });
    return {
      skipped: false,
      queued: true,
      locked: false,
      reason: "queued",
      reply: null,
      conversationId: conv?.id || null,
    };
  }

  return flushPromise;
}
