import { Activity, Conversation, Guest, Message } from "../models/index.js";
import { asyncHandler } from "../utils/async.js";
import { requireEvent } from "../services/access.service.js";
import { serializeActivity } from "../utils/serialize.js";
import { buildAnalytics } from "../services/state.service.js";
import { userEventIds } from "../services/access.service.js";

export const getAnalytics = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  const guests = await Guest.findAll({ where: { eventId: event.id } });
  const conversations = await Conversation.findAll({ where: { eventId: event.id } });
  const convIds = conversations.map((c) => c.id);
  const messages = convIds.length
    ? await Message.findAll({ where: { conversationId: convIds } })
    : [];
  res.json(buildAnalytics(guests, conversations, messages));
});

export const listActivity = asyncHandler(async (req, res) => {
  const ids = await userEventIds(req.user.id);
  const where = req.params.eventId ? {} : { eventId: ids };
  if (req.params.eventId) {
    const event = await requireEvent(req, res);
    if (!event) return;
    where.eventId = event.id;
    const items = await Activity.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: Number(req.query.limit) || 30,
    });
    return res.json(items.map((a) => serializeActivity(a, event.slug)));
  }
  const items = await Activity.findAll({
    where: ids.length ? { eventId: ids } : { eventId: "__none__" },
    order: [["createdAt", "DESC"]],
    limit: Number(req.query.limit) || 30,
  });
  const { Event } = await import("../models/index.js");
  const events = ids.length ? await Event.findAll({ where: { id: ids } }) : [];
  const slugById = Object.fromEntries(events.map((e) => [e.id, e.slug]));
  res.json(items.map((a) => serializeActivity(a, slugById[a.eventId])));
});
