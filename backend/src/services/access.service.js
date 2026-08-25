import { Op } from "sequelize";
import { Event, EventMember, EventRolePermission } from "../models/index.js";
import { memberWhere } from "./membership.service.js";

export const PERMS = {
  EDIT_ALL: "Editar todo",
  EDIT_EVENT: "Editar evento",
  MANAGE_TEAM: "Gestionar equipo",
  CONFIG_AI: "Configurar asistente",
  REPLY: "Responder conversaciones",
  CONFIRM: "Registrar confirmaciones",
  VIEW_GUESTS: "Ver invitados",
  VIEW_CHATS: "Ver conversaciones",
  EXPORT: "Exportar datos",
  CREATE_EVENTS: "Crear eventos",
};

export async function userEventIds(userId) {
  const owned = await Event.findAll({ where: { ownerId: userId }, attributes: ["id"] });
  const memberOf = await EventMember.findAll({
    where: memberWhere({ userId }),
    attributes: ["eventId"],
  });
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

export async function getMemberRole(userId, event) {
  if (!event) return null;
  if (event.ownerId === userId) return "Administrador";
  const member = await EventMember.findOne({
    where: memberWhere({ eventId: event.id, userId }),
  });
  return member?.role || null;
}

export async function getEnabledPermissions(eventId, role) {
  if (!role) return [];
  const rows = await EventRolePermission.findAll({
    where: { eventId, role, enabled: true },
  });
  return rows.map((row) => row.permission);
}

export async function hasEventPermission(user, event, permission) {
  if (!user || !event) return false;
  if (user.isAdmin || user.id === event.ownerId) return true;
  const role = await getMemberRole(user.id, event);
  if (!role) return false;
  const perms = await getEnabledPermissions(event.id, role);
  if (perms.includes(PERMS.EDIT_ALL)) return true;
  return perms.includes(permission);
}

export async function requirePermission(req, res, event, permission) {
  const ok = await hasEventPermission(req.user, event, permission);
  if (!ok) {
    res.status(403).json({ error: "No tienes permiso para esta acción." });
    return false;
  }
  return true;
}

export async function requireEventOwner(req, res, event) {
  if (req.user?.isAdmin || req.user?.id === event.ownerId) return true;
  res.status(403).json({ error: "Solo el dueño del evento puede hacer esto." });
  return false;
}

export async function getEventAccess(user, event) {
  if (user?.isAdmin || user?.id === event.ownerId) {
    const perms = await getEnabledPermissions(event.id, "Administrador");
    return {
      role: "Administrador",
      permissions: perms.includes(PERMS.EDIT_ALL) ? perms : [...new Set([...perms, PERMS.EDIT_ALL])],
    };
  }
  const role = await getMemberRole(user.id, event);
  if (!role) return { role: null, permissions: [] };
  return { role, permissions: await getEnabledPermissions(event.id, role) };
}
