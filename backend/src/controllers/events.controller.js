import { Op } from "sequelize";
import {
  Activity,
  AiConfig,
  Campaign,
  Conversation,
  Event,
  EventMember,
  EventRolePermission,
  Faq,
  Guest,
  Message,
  Template,
  sequelize,
} from "../models/index.js";
import { asyncHandler } from "../utils/async.js";
import { slugify } from "../utils/slug.js";
import { serializeEvent, serializeGuest } from "../utils/serialize.js";
import { requireEvent, requirePermission, requireEventOwner, userEventIds, PERMS } from "../services/access.service.js";
import { seedEventDefaults } from "../services/event-setup.service.js";
import { logActivity } from "../services/activity.service.js";
import { assertCanCreateEvent } from "../services/plans.service.js";

const DEFAULT_COVER = "linear-gradient(135deg, var(--gold-soft), var(--rose))";

function sanitizeCover(value) {
  const cover = String(value || "").trim();
  if (!cover) return DEFAULT_COVER;
  if (cover.length > 1_800_000) {
    const err = new Error("La imagen de portada es demasiado grande.");
    err.status = 400;
    throw err;
  }
  const allowed =
    cover.startsWith("linear-gradient(") ||
    cover.startsWith("data:image/") ||
    /^https?:\/\//i.test(cover);
  if (!allowed) return DEFAULT_COVER;
  return cover;
}

async function uniqueSlug(base) {
  let slug = slugify(base);
  let i = 2;
  while (await Event.findOne({ where: { slug } })) {
    slug = `${slugify(base)}-${i++}`;
  }
  return slug;
}

export const listEvents = asyncHandler(async (req, res) => {
  const ids = await userEventIds(req.user.id);
  const events = ids.length
    ? await Event.findAll({ where: { id: ids }, order: [["createdAt", "DESC"]] })
    : [];
  res.json(events.map(serializeEvent));
});

export const createEvent = asyncHandler(async (req, res) => {
  await assertCanCreateEvent(req.user);
  const body = req.body || {};
  const slug = await uniqueSlug(body.id || body.slug || body.name || `evento-${Date.now()}`);
  const event = await Event.create({
    ownerId: req.user.id,
    slug,
    name: body.name || "Nuevo evento",
    shortName: body.shortName || String(body.name || "EVT").slice(0, 3).toUpperCase(),
    type: body.type || "Boda",
    hosts: body.hosts || "Anfitriones",
    date: body.date || "2027-01-01",
    time: body.time || "18:00",
    venue: body.venue || "Por definir",
    address: body.address || "",
    estimatedGuests: Number(body.estimatedGuests) || 0,
    cover: sanitizeCover(body.cover),
    status: body.status || "borrador",
  });
  await seedEventDefaults(event, req.user);
  await logActivity(event.id, `Se creó el evento ${event.name}`, "system");
  res.status(201).json(serializeEvent(event));
});

export const getEvent = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  res.json(serializeEvent(event));
});

export const updateEvent = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  if (!(await requirePermission(req, res, event, PERMS.EDIT_EVENT))) return;
  const allowed = [
    "name",
    "shortName",
    "type",
    "hosts",
    "date",
    "time",
    "venue",
    "address",
    "estimatedGuests",
    "cover",
    "status",
  ];
  for (const key of allowed) {
    if (req.body?.[key] === undefined) continue;
    event[key] = key === "cover" ? sanitizeCover(req.body[key]) : req.body[key];
  }
  await event.save();
  res.json(serializeEvent(event));
});

export const deleteEvent = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  if (!(await requireEventOwner(req, res, event))) return;
  const conversations = await Conversation.findAll({ where: { eventId: event.id }, attributes: ["id"] });
  const convIds = conversations.map((row) => row.id);
  await sequelize.transaction(async (t) => {
    if (convIds.length) await Message.destroy({ where: { conversationId: convIds }, transaction: t });
    await Conversation.destroy({ where: { eventId: event.id }, transaction: t });
    await Guest.destroy({ where: { eventId: event.id }, transaction: t });
    await EventMember.destroy({ where: { eventId: event.id }, transaction: t });
    await EventRolePermission.destroy({ where: { eventId: event.id }, transaction: t });
    await AiConfig.destroy({ where: { eventId: event.id }, transaction: t });
    await Template.destroy({ where: { eventId: event.id }, transaction: t });
    await Faq.destroy({ where: { eventId: event.id }, transaction: t });
    await Activity.destroy({ where: { eventId: event.id }, transaction: t });
    await Campaign.destroy({ where: { eventId: event.id }, transaction: t });
    await event.destroy({ transaction: t });
  });
  res.json({ ok: true });
});

export const listGuests = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  const where = { eventId: event.id };
  if (req.query.status && req.query.status !== "todos") where.status = req.query.status;
  if (req.query.search) {
    where[Op.or] = [
      { rep: { [Op.like]: `%${req.query.search}%` } },
      { phone: { [Op.like]: `%${req.query.search}%` } },
    ];
  }
  const guests = await Guest.findAll({ where, order: [["createdAt", "ASC"]] });
  res.json(guests.map((g) => serializeGuest(g, event.slug)));
});
