import { Op } from "sequelize";
import { Event, EventMember } from "../models/index.js";

export async function userEventIds(userId) {
  const owned = await Event.findAll({ where: { ownerId: userId }, attributes: ["id"] });
  const memberOf = await EventMember.findAll({ where: { userId }, attributes: ["eventId"] });
  return [...new Set([...owned.map((e) => e.id), ...memberOf.map((m) => m.eventId)])];
}

export async function findAccessibleEvent(userId, idOrSlug) {
  const ids = await userEventIds(userId);
  if (!ids.length) return null;
  return Event.findOne({
    where: {
      [Op.and]: [{ [Op.or]: [{ id: idOrSlug }, { slug: idOrSlug }] }, { id: { [Op.in]: ids } }],
    },
  });
}

export async function requireEvent(req, res) {
  const event = await findAccessibleEvent(req.user.id, req.params.eventId);
  if (!event) {
    res.status(404).json({ error: "Este evento no existe." });
    return null;
  }
  return event;
}
