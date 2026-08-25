import { EventMember, EventRolePermission, User } from "../models/index.js";
import { asyncHandler } from "../utils/async.js";
import { requireEvent } from "../services/access.service.js";
import { serializeMember, serializeRolePermission } from "../utils/serialize.js";
import { initialsFromName } from "../utils/slug.js";
import { sendTeamInvitationEmail } from "../services/email.service.js";
import { env } from "../config/env.js";
import { normalizeEmail } from "../services/membership.service.js";

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const listMembers = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  const members = await EventMember.findAll({ where: { eventId: event.id }, order: [["createdAt", "ASC"]] });
  res.json(members.map(serializeMember));
});

export const inviteMember = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  const { name, email, role } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "El nombre es requerido." });

  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !isValidEmail(cleanEmail)) {
    return res.status(400).json({ error: "El correo es requerido." });
  }

  const roles = [...new Set((await EventRolePermission.findAll({ where: { eventId: event.id } })).map((p) => p.role))];
  const memberRole = role || "Asistente";
  if (!roles.includes(memberRole)) {
    return res.status(400).json({ error: "El rol no es válido para este evento." });
  }

  const existingUser = await User.findOne({ where: { email: cleanEmail } });

  const member = await EventMember.create({
    eventId: event.id,
    userId: existingUser?.id || null,
    name: name.trim(),
    email: cleanEmail,
    role: memberRole,
    initials: initialsFromName(name),
  });

  const base = (env.frontendUrl || env.clientUrl || "http://localhost:8080").replace(/\/$/, "");
  const inviteLink = `${base}/iniciar-sesion?email=${encodeURIComponent(cleanEmail)}`;

  try {
    await sendTeamInvitationEmail({
      to: cleanEmail,
      name: member.name,
      eventName: event.name,
      role: member.role,
      inviteLink,
    });
  } catch (err) {
    console.error("[Email Error]: Falló el envío de correo de invitación:", err.message);
  }

  res.status(201).json(serializeMember(member));
});

export const updateMember = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  const member = await EventMember.findOne({ where: { id: req.params.memberId, eventId: event.id } });
  if (!member) return res.status(404).json({ error: "Miembro no encontrado." });
  if (req.body?.name) {
    member.name = req.body.name;
    member.initials = initialsFromName(req.body.name);
  }
  if (req.body?.email !== undefined) member.email = normalizeEmail(req.body.email) || req.body.email;
  if (req.body?.role) member.role = req.body.role;
  await member.save();
  res.json(serializeMember(member));
});

export const deleteMember = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  const member = await EventMember.findOne({ where: { id: req.params.memberId, eventId: event.id } });
  if (!member) return res.status(404).json({ error: "Miembro no encontrado." });
  await member.destroy();
  res.json({ ok: true });
});

export const listPermissions = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  const perms = await EventRolePermission.findAll({ where: { eventId: event.id } });
  res.json(perms.map(serializeRolePermission));
});

export const updatePermission = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  const perm = await EventRolePermission.findOne({
    where: { id: req.params.permissionId, eventId: event.id },
  });
  if (!perm) return res.status(404).json({ error: "Permiso no encontrado." });
  if (req.body?.enabled !== undefined) perm.enabled = !!req.body.enabled;
  await perm.save();
  res.json(serializeRolePermission(perm));
});
