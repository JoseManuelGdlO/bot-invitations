import { AiConfig, BotSession, Conversation, Event, Guest, Message, sequelize } from "../models/index.js";
import { asyncHandler } from "../utils/async.js";
import { serializeGuest } from "../utils/serialize.js";
import { requireEvent, userEventIds, requirePermission, hasEventPermission, PERMS } from "../services/access.service.js";
import { logActivity } from "../services/activity.service.js";
import { mapRows, parseSpreadsheet, suggestMapping } from "../services/import.service.js";
import { guestsToRows, toCsv, toPdf, toXlsx } from "../services/export.service.js";
import { assertCanAddGuestsForEvent, assertCanSendInvitations } from "../services/plans.service.js";
import { assertWhatsappReady } from "../services/integration-resolver.service.js";
import { deliverAiMessage } from "../services/guest-message.service.js";
import { findTemplate, resolveOpeningParts, resolveReminderText } from "../services/templates.service.js";
import { assertOpeningDocumentReady } from "../services/opening-document.service.js";
import { openingHeaderDocumentFrom } from "../services/whatsapp.adapter.js";
import { phonesMatch } from "../services/bot/session.service.js";

async function findGuestForUser(userId, guestId) {
  const ids = await userEventIds(userId);
  if (!ids.length) return { guest: null, event: null };
  const guest = await Guest.findOne({ where: { id: guestId, eventId: ids } });
  if (!guest) return { guest: null, event: null };
  const event = await Event.findByPk(guest.eventId);
  return { guest, event };
}

function parseInvitedCount(value, fallback = 1) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.round(n);
}

export const createGuest = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  const body = req.body || {};
  if (!body.rep || !body.phone) return res.status(400).json({ error: "Nombre y teléfono son requeridos." });
  const invited = parseInvitedCount(body.invited, 1);
  if (invited == null) return res.status(400).json({ error: "El número de invitados debe ser al menos 1." });
  await assertCanAddGuestsForEvent(req.user, event, invited);
  if (!(await requirePermission(req, res, event, PERMS.EDIT_ALL))) return;
  const guest = await Guest.create({
    eventId: event.id,
    rep: body.rep,
    phone: body.phone,
    invited,
    confirmed: Number(body.confirmed) || 0,
    table: body.table || "",
    family: body.family || "",
    guestType: body.guestType || "",
    notes: body.notes || "",
    tag: body.tag || "Sin etiqueta",
    status: body.status || "sin_contactar",
    whatsapp: body.whatsapp || "pendiente",
  });
  res.status(201).json(serializeGuest(guest, event.slug));
});

export const updateGuest = asyncHandler(async (req, res) => {
  const { guest, event } = await findGuestForUser(req.user.id, req.params.guestId);
  if (!guest) return res.status(404).json({ error: "Invitado no encontrado." });
  if (!event) return res.status(404).json({ error: "Evento no encontrado." });
  const canEditAll = await hasEventPermission(req.user, event, PERMS.EDIT_ALL);
  const canConfirm = await hasEventPermission(req.user, event, PERMS.CONFIRM);
  const confirmationKeys = new Set(["status", "confirmed", "whatsapp"]);
  const incomingKeys = Object.keys(req.body || {}).filter((key) => req.body[key] !== undefined);
  const onlyConfirmation = incomingKeys.every((key) => confirmationKeys.has(key));
  if (!canEditAll && !(canConfirm && onlyConfirmation)) {
    return res.status(403).json({ error: "No tienes permiso para esta acción." });
  }
  const allowed = canEditAll
    ? [
        "rep",
        "phone",
        "invited",
        "confirmed",
        "table",
        "family",
        "guestType",
        "notes",
        "tag",
        "status",
        "whatsapp",
        "lastMessage",
        "lastReply",
        "lastReplyAt",
        "followUp",
      ]
    : ["status", "confirmed", "whatsapp"];
  if (req.body?.invited !== undefined) {
    const next = parseInvitedCount(req.body.invited, null);
    if (next == null) return res.status(400).json({ error: "El número de invitados debe ser al menos 1." });
    req.body.invited = next;
    const delta = next - Number(guest.invited || 0);
    if (delta > 0) await assertCanAddGuestsForEvent(req.user, event, delta);
  }
  const previousPhone = guest.phone;
  for (const key of allowed) {
    if (req.body?.[key] !== undefined) guest[key] = req.body[key];
  }
  if (req.body?.phone !== undefined && !phonesMatch(previousPhone, guest.phone)) {
    guest.whatsappChatId = null;
  }
  if (["confirmado", "parcial"].includes(guest.status) && !guest.confirmedAt) {
    guest.confirmedAt = new Date();
  }
  await guest.save();
  if (guest.status === "confirmado") {
    await logActivity(event.id, `${guest.rep} confirmó ${guest.confirmed} de ${guest.invited} lugares`, "confirm");
  }
  res.json(serializeGuest(guest, event.slug));
});

export const deleteGuest = asyncHandler(async (req, res) => {
  const { guest, event } = await findGuestForUser(req.user.id, req.params.guestId);
  if (!guest) return res.status(404).json({ error: "Invitado no encontrado." });
  if (!event) return res.status(404).json({ error: "Evento no encontrado." });
  if (!(await requirePermission(req, res, event, PERMS.EDIT_ALL))) return;
  const conv = await Conversation.findOne({ where: { guestId: guest.id } });
  await sequelize.transaction(async (t) => {
    if (conv) {
      await Message.destroy({ where: { conversationId: conv.id }, transaction: t });
      await Conversation.destroy({ where: { id: conv.id }, transaction: t });
    }
    await BotSession.destroy({ where: { guestId: guest.id }, transaction: t });
    await guest.destroy({ transaction: t });
  });
  await logActivity(event.id, `Se eliminó a ${guest.rep} de la lista de invitados`, "system");
  res.json({ ok: true });
});

async function deliverOpeningInvitation({ event, guest, plannerName }) {
  const opening = await findTemplate(event.id, { category: "Primer contacto" });
  const document = await assertOpeningDocumentReady(opening);
  const hsmHeaderDocument = openingHeaderDocumentFrom(document);
  const hsmTemplateName = hsmHeaderDocument ? document.templateName : null;
  const ai = await AiConfig.findOne({ where: { eventId: event.id } });
  const { text, params, param1, param2 } = await resolveOpeningParts(
    opening,
    event,
    guest,
    plannerName,
    ai?.openingMessage,
  );
  return deliverAiMessage({
    event,
    guest,
    text,
    hsmParams: params?.length ? params : [param1, param2],
    ...(hsmTemplateName ? { hsmTemplateName } : {}),
    ...(hsmHeaderDocument ? { hsmHeaderDocument } : {}),
    kind: "campaign",
    guestPatch: {
      status: "enviado",
      whatsapp: "pendiente",
      contactedAt: new Date(),
    },
  });
}

export const remindGuest = asyncHandler(async (req, res) => {
  const { guest, event } = await findGuestForUser(req.user.id, req.params.guestId);
  if (!guest) return res.status(404).json({ error: "Invitado no encontrado." });
  if (!event) return res.status(404).json({ error: "Evento no encontrado." });
  if (!(await requirePermission(req, res, event, PERMS.REPLY))) return;
  assertCanSendInvitations(req.user);
  await assertWhatsappReady(event);

  const sendOpening = guest.status === "sin_contactar";
  if (sendOpening) {
    await deliverOpeningInvitation({ event, guest, plannerName: req.user.name });
    await logActivity(event.id, `Se envió la invitación inicial a ${guest.rep}`, "message");
  } else {
    const text = await resolveReminderText(event, guest, req.user.name);
    await deliverAiMessage({
      event,
      guest,
      text,
      kind: "reminder",
      guestPatch: {
        status: guest.status,
        whatsapp: "pendiente",
        contactedAt: guest.contactedAt || new Date(),
      },
    });
    await logActivity(event.id, `Se envió un recordatorio a ${guest.rep}`, "message");
  }
  res.json(serializeGuest(guest, event.slug));
});

export const previewImport = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  if (!(await requirePermission(req, res, event, PERMS.EDIT_ALL))) return;
  if (!req.file?.buffer) return res.status(400).json({ error: "Sube un archivo .xlsx, .xls o .csv" });
  const parsed = parseSpreadsheet(req.file.buffer);
  res.json({
    filename: req.file.originalname,
    columns: parsed.columns,
    rows: parsed.rows,
    suggestedMapping: suggestMapping(parsed.columns),
  });
});

export const confirmImport = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  if (!(await requirePermission(req, res, event, PERMS.EDIT_ALL))) return;
  const { columns, rows, mapping } = req.body || {};
  if (!columns || !rows || !mapping) return res.status(400).json({ error: "Faltan columnas, filas o mapeo." });
  const mapped = mapRows(columns, rows, mapping);
  const discarded = Math.max(0, rows.length - mapped.length);
  const existing = await Guest.findAll({ where: { eventId: event.id }, attributes: ["phone"] });
  const phones = new Set(existing.map((g) => g.phone.replace(/\s/g, "")));
  const incoming = mapped.filter((row) => !phones.has(row.phone.replace(/\s/g, "")));
  const incomingPeople = incoming.reduce((sum, row) => sum + (Number(row.invited) || 1), 0);
  await assertCanAddGuestsForEvent(req.user, event, incomingPeople);
  const created = [];
  let skipped = 0;
  for (const row of mapped) {
    const key = row.phone.replace(/\s/g, "");
    if (phones.has(key)) {
      skipped += 1;
      continue;
    }
    phones.add(key);
    created.push(
      await Guest.create({
        eventId: event.id,
        ...row,
        status: "sin_contactar",
        whatsapp: "pendiente",
      }),
    );
  }
  await logActivity(event.id, `Se importaron ${created.length} invitaciones desde Excel`, "system");
  res.json({
    imported: created.length,
    skipped,
    discarded,
    guests: created.map((g) => serializeGuest(g, event.slug)),
  });
});

export const exportGuests = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  if (!(await requirePermission(req, res, event, PERMS.EXPORT))) return;
  const format = String(req.query.format || "xlsx");
  const guests = await Guest.findAll({ where: { eventId: event.id }, order: [["rep", "ASC"]] });
  const rows = guestsToRows(guests, event.slug);
  await sendExport(res, event, rows, format, `invitados-${event.slug}`);
});

export const exportFinalList = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  if (!(await requirePermission(req, res, event, PERMS.EXPORT))) return;
  const format = String(req.query.format || "xlsx");
  const guests = await Guest.findAll({ where: { eventId: event.id } });
  const rows = guestsToRows(
    guests.filter((g) => g.confirmed > 0),
    event.slug,
  );
  await sendExport(res, event, rows, format, `lista-final-${event.slug}`);
});

async function sendExport(res, event, rows, format, basename) {
  if (format === "csv") {
    const buf = await toCsv(rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${basename}.csv"`);
    return res.send(buf);
  }
  if (format === "pdf") {
    const buf = await toPdf(event, rows);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${basename}.pdf"`);
    return res.send(buf);
  }
  const buf = await toXlsx(rows, event.name);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${basename}.xlsx"`);
  return res.send(buf);
}

