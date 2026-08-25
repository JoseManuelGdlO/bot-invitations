import { Conversation, Event, Guest, Message, Template } from "../models/index.js";
import { asyncHandler } from "../utils/async.js";
import { serializeGuest } from "../utils/serialize.js";
import { requireEvent, userEventIds } from "../services/access.service.js";
import { logActivity } from "../services/activity.service.js";
import { enqueueJob } from "../services/outbound.worker.js";
import { mapRows, parseSpreadsheet, suggestMapping } from "../services/import.service.js";
import { guestsToRows, toCsv, toPdf, toXlsx } from "../services/export.service.js";
import { assertCanAddGuests, assertCanSendInvitations } from "../services/plans.service.js";
import { applyTemplate, eventGuestVars } from "../utils/defaults.js";
import { formatClock } from "../utils/time.js";
import { appendOutboundToSession } from "../services/bot/bot.service.js";

async function findGuestForUser(userId, guestId) {
  const ids = await userEventIds(userId);
  if (!ids.length) return { guest: null, event: null };
  const guest = await Guest.findOne({ where: { id: guestId, eventId: ids } });
  if (!guest) return { guest: null, event: null };
  const event = await Event.findByPk(guest.eventId);
  return { guest, event };
}

export const createGuest = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  const body = req.body || {};
  if (!body.rep || !body.phone) return res.status(400).json({ error: "Nombre y teléfono son requeridos." });
  await assertCanAddGuests(req.user, Number(body.invited) || 1);
  const guest = await Guest.create({
    eventId: event.id,
    rep: body.rep,
    phone: body.phone,
    invited: Number(body.invited) || 1,
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
  const allowed = [
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
  ];
  if (req.body?.invited !== undefined) {
    const next = Number(req.body.invited) || 0;
    const delta = next - Number(guest.invited || 0);
    if (delta > 0) await assertCanAddGuests(req.user, delta);
  }
  for (const key of allowed) {
    if (req.body?.[key] !== undefined) guest[key] = req.body[key];
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

export const remindGuest = asyncHandler(async (req, res) => {
  const { guest, event } = await findGuestForUser(req.user.id, req.params.guestId);
  if (!guest) return res.status(404).json({ error: "Invitado no encontrado." });
  assertCanSendInvitations(req.user);
  const reminder = await Template.findOne({
    where: { eventId: event.id, category: "Recordatorio" },
    order: [["createdAt", "ASC"]],
  });
  const text = applyTemplate(
    reminder?.body || "Hola {{nombre}}, ¿pudiste revisar la invitación? Nos encantaría contar contigo el {{fecha}}.",
    eventGuestVars(event, guest, req.user.name),
  );
  guest.status = guest.status === "sin_contactar" ? "enviado" : guest.status;
  guest.whatsapp = "enviado";
  guest.lastMessage = text.slice(0, 80);
  guest.contactedAt = guest.contactedAt || new Date();
  await guest.save();
  let conv = await Conversation.findOne({ where: { guestId: guest.id } });
  if (!conv) {
    conv = await Conversation.create({
      eventId: event.id,
      guestId: guest.id,
      aiPaused: false,
      unread: 0,
    });
  }
  await Message.create({
    conversationId: conv.id,
    from: "ai",
    text,
    at: formatClock(),
  });
  await enqueueJob("whatsapp.send", {
    to: guest.phone,
    text,
    guestId: guest.id,
    eventId: event.id,
    conversationId: conv.id,
  });
  await appendOutboundToSession({ event, guest, text });
  await logActivity(event.id, `Se envió un recordatorio a ${guest.rep}`, "message");
  res.json(serializeGuest(guest, event.slug));
});

export const previewImport = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
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
  const { columns, rows, mapping } = req.body || {};
  if (!columns || !rows || !mapping) return res.status(400).json({ error: "Faltan columnas, filas o mapeo." });
  const mapped = mapRows(columns, rows, mapping);
  const existing = await Guest.findAll({ where: { eventId: event.id }, attributes: ["phone"] });
  const phones = new Set(existing.map((g) => g.phone.replace(/\s/g, "")));
  const incoming = mapped.filter((row) => !phones.has(row.phone.replace(/\s/g, "")));
  const incomingPeople = incoming.reduce((sum, row) => sum + (Number(row.invited) || 1), 0);
  await assertCanAddGuests(req.user, incomingPeople);
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
    guests: created.map((g) => serializeGuest(g, event.slug)),
  });
});

export const exportGuests = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  const format = String(req.query.format || "xlsx");
  const guests = await Guest.findAll({ where: { eventId: event.id }, order: [["rep", "ASC"]] });
  const rows = guestsToRows(guests, event.slug);
  await sendExport(res, event, rows, format, `invitados-${event.slug}`);
});

export const exportFinalList = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
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

