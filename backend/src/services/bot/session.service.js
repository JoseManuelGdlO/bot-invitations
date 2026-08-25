import { Op } from "sequelize";
import { BotSession, sequelize } from "../../models/index.js";
import { dropIncompleteToolCalls, trimHistoryItems } from "./openai.service.js";

const LOCK_MS = 180000;

export function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

export function phonesMatch(a, b) {
  const x = normalizePhone(a);
  const y = normalizePhone(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (Math.min(x.length, y.length) < 10) return false;
  return x.endsWith(y.slice(-10)) || y.endsWith(x.slice(-10));
}

export function playgroundUserId(eventId, guestId) {
  return `playground_${eventId}_${guestId}`;
}

export function liveUserId(guest) {
  return normalizePhone(guest?.phone) || String(guest?.phone || guest?.id || "");
}

export function isPlaygroundUserId(userId) {
  return String(userId || "").startsWith("playground_");
}

function asItems(value) {
  if (Array.isArray(value)) return [...value];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export { asItems };

export async function getBotSession({ eventId, guestId, userId }) {
  return BotSession.findOne({ where: { eventId, guestId, userId } });
}

export async function getOrCreateBotSession({ eventId, guestId, userId }) {
  const existing = await getBotSession({ eventId, guestId, userId });
  if (existing) return existing;
  return BotSession.create({
    eventId,
    guestId,
    userId,
    items: [],
    lockedUntil: null,
  });
}

export async function saveSessionItems(session, items) {
  const cleaned = trimHistoryItems(dropIncompleteToolCalls(items));
  session.items = cleaned;
  session.changed("items", true);
  session.lockedUntil = null;
  await session.save();
  return session;
}

export async function appendSessionItems(session, extraItems) {
  const current = asItems(session.items);
  current.push(...extraItems);
  return saveSessionItems(session, current);
}

export async function tryLockBotSession(session, lockMs = LOCK_MS) {
  const now = Date.now();
  return sequelize.transaction(async (transaction) => {
    const row = await BotSession.findOne({
      where: { id: session.id },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!row) return false;
    const current = row.lockedUntil ? new Date(row.lockedUntil).getTime() : 0;
    if (current > now) return false;
    row.lockedUntil = new Date(now + lockMs);
    await row.save({ transaction });
    session.lockedUntil = row.lockedUntil;
    return true;
  });
}

export async function refreshBotSessionLock(session, lockMs = LOCK_MS) {
  session.lockedUntil = new Date(Date.now() + lockMs);
  await session.save();
}

export async function unlockBotSession(session) {
  session.lockedUntil = null;
  await session.save();
}

export async function deleteBotSession({ eventId, guestId, userId }) {
  return BotSession.destroy({ where: { eventId, guestId, userId } });
}

export async function resetPlaygroundSessions(eventId) {
  return BotSession.destroy({
    where: {
      eventId,
      userId: { [Op.like]: `playground_${eventId}_%` },
    },
  });
}
