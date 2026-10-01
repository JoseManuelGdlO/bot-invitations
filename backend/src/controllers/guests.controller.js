import { BotSession, Conversation, Event, Guest, Message, sequelize } from "../models/index.js";
import { asyncHandler } from "../utils/async.js";
import { serializeGuest } from "../utils/serialize.js";
import { requireEvent, userEventIds, requirePermission, hasEventPermission, PERMS } from "../services/access.service.js";
import { logActivity } from "../services/activity.service.js";
import { mapRows, parseSpreadsheet, suggestMapping } from "../services/import.service.js";
import {
  deleteStoredGuestImage,
  embeddedImageCells,
  extractSheetImages,
  guestImageStatuses,
  markEmbeddedImageCells,
  resolveGuestImageBytes,
  saveGuestImage,
  deleteGuestImage,
} from "../services/guest-image.service.js";
import { headerImageForSend } from "../services/guest-qr.service.js";
import { discardStagedSpreadsheet, readStagedSpreadsheet, stageSpreadsheet } from "../services/import-staging.service.js";
import { guestsToRows, toCsv, toPdf, toXlsx } from "../services/export.service.js";
import { assertCanAddGuestsForEvent, assertCanSendInvitations } from "../services/plans.service.js";
import { assertWhatsappReady } from "../services/integration-resolver.service.js";
import { deliverAiMessage } from "../services/guest-message.service.js";
import { phonesMatch } from "../services/bot/session.service.js";
import { normalizeGuestPhoneDigits } from "../utils/whatsapp-identity.js";
import { resolveCampaignSendContext, resolvePurposeSendContext } from "../services/whatsapp-templates.service.js";
import { fillMetaTemplate } from "../services/meta.client.js";
import { bodyTextFromComponents } from "../services/whatsapp-template-slots.js";

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
  const previousStatus = guest.status;
  const previousConfirmed = Number(guest.confirmed) || 0;
  const previousInvited = Number(guest.invited) || 0;
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
  const nextConfirmed = Number(guest.confirmed) || 0;
  const nextInvited = Number(guest.invited) || 0;
  const rsvpChanged =
    previousStatus !== guest.status || previousConfirmed !== nextConfirmed || previousInvited !== nextInvited;
  if (rsvpChanged && ["confirmado", "parcial"].includes(guest.status)) {
    await logActivity(event.id, `${guest.rep} confirmó ${guest.confirmed} de ${guest.invited} lugares`, "confirm");
  } else if (rsvpChanged && guest.status === "no_asistira") {
    await logActivity(event.id, `${guest.rep} no podrá asistir`, "reject");
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
  await deleteStoredGuestImage(guest);
  await logActivity(event.id, `Se eliminó a ${guest.rep} de la lista de invitados`, "system");
  res.json({ ok: true });
});

async function deliverOpeningInvitation({ event, guest, plannerName, sync = false }) {
  return deliverPurposeHsm({
    event,
    guest,
    plannerName,
    purpose: "invitation",
    kind: "campaign",
    sync,
    guestPatch: {
      status: "enviado",
      whatsapp: "pendiente",
      contactedAt: new Date(),
    },
  });
}

async function deliverPurposeHsm({
  event,
  guest,
  plannerName,
  purpose,
  kind,
  guestPatch = {},
  followUpId,
  sync = false,
}) {
  const ctx = purpose === "invitation"
    ? await resolveCampaignSendContext(event)
    : await resolvePurposeSendContext(event, purpose);
  const params = await ctx.hsmParamsFor(guest, plannerName);
  const headerImage = await headerImageForSend(ctx, guest);
  return deliverAiMessage({
    event,
    guest,
    text: fillMetaTemplate(bodyTextFromComponents(ctx.template.components), params),
    hsmParams: params,
    hsmTemplateName: ctx.hsmTemplateName,
    ...(ctx.hsmHeaderDocument ? { hsmHeaderDocument: ctx.hsmHeaderDocument } : {}),
    ...(headerImage ? { hsmHeaderImage: headerImage } : {}),
    kind,
    sync,
    ...(followUpId ? { followUpId } : {}),
    guestPatch,
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
    await deliverOpeningInvitation({ event, guest, plannerName: req.user.name, sync: true });
    await logActivity(event.id, `Se envió la invitación inicial a ${guest.rep}`, "message");
  } else {
    await deliverPurposeHsm({
      event,
      guest,
      plannerName: req.user.name,
      purpose: "reminder",
      kind: "reminder",
      sync: true,
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
  const suggestedMapping = suggestMapping(parsed.columns);
  const images = await extractSheetImages(req.file.buffer);
  const imageStatus = guestImageStatuses({ ...parsed, mapping: suggestedMapping, images });
  const importToken = await stageSpreadsheet({
    userId: req.user.id,
    eventId: event.id,
    buffer: req.file.buffer,
    filename: req.file.originalname,
  });
  res.json({
    filename: req.file.originalname,
    columns: parsed.columns,
    rows: markEmbeddedImageCells({ rows: parsed.rows, sheetRows: parsed.sheetRows, images }),
    suggestedMapping,
    importToken,
    sheetRows: parsed.sheetRows,
    hyperlinks: parsed.hyperlinks,
    embeddedImageCells: embeddedImageCells(images),
    imageStatus,
  });
});

async function storeImportedGuestImage(guest, row, { images, imageCol, imageWarnings }) {
  if (imageCol < 0) return false;
  const embedded = images.get(`${row.sheetRow}:${imageCol + 1}`) || null;
  const resolved = await resolveGuestImageBytes({ embedded, cellText: row.imageCell });
  if (resolved.warning) {
    imageWarnings.push({ sheetRow: row.sheetRow, rep: row.rep, reason: resolved.warning });
    return false;
  }
  if (!resolved.buffer) return false;
  try {
    const previous = String(guest.invitationImagePath || "").trim().replace(/\\/g, "/");
    const next = await saveGuestImage({
      eventId: guest.eventId,
      guestId: guest.id,
      buffer: resolved.buffer,
    });
    if (previous && previous !== next) await deleteGuestImage(previous);
    guest.invitationImagePath = next;
    await guest.save();
    return true;
  } catch {
    imageWarnings.push({
      sheetRow: row.sheetRow,
      rep: row.rep,
      reason: "No se pudo guardar la imagen.",
    });
    return false;
  }
}

async function storeImportedEnlace(guest, row) {
  const enlace = String(row.customData?.enlace || "").trim();
  if (!enlace) return;
  const current =
    guest.customData && typeof guest.customData === "object" && !Array.isArray(guest.customData)
      ? guest.customData
      : {};
  if (String(current.enlace || "") === enlace) return;
  guest.customData = { ...current, enlace };
  await guest.save();
}

export const confirmImport = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  if (!(await requirePermission(req, res, event, PERMS.EDIT_ALL))) return;
  const { mapping, importToken } = req.body || {};
  if (!mapping) return res.status(400).json({ error: "Faltan columnas, filas o mapeo." });
  let columns = req.body?.columns;
  let rows = req.body?.rows;
  let sheetRows;
  let hyperlinks;
  let fileBuffer = null;
  if (importToken) {
    const staged = await readStagedSpreadsheet({
      token: importToken,
      userId: req.user.id,
      eventId: event.id,
    });
    const parsed = parseSpreadsheet(staged.buffer);
    columns = parsed.columns;
    rows = parsed.rows;
    sheetRows = parsed.sheetRows;
    hyperlinks = parsed.hyperlinks;
    fileBuffer = staged.buffer;
  }
  if (!columns || !rows) return res.status(400).json({ error: "Faltan columnas, filas o mapeo." });
  const mapped = mapRows(columns, rows, mapping, { sheetRows, hyperlinks });
  const discarded = Math.max(0, rows.length - mapped.length);
  const existing = await Guest.findAll({ where: { eventId: event.id } });
  const phoneKey = (value) => normalizeGuestPhoneDigits(value) || String(value || "").replace(/\s/g, "");
  const guestsByPhone = new Map(existing.map((guest) => [phoneKey(guest.phone), guest]));
  const incoming = mapped.filter((row) => !guestsByPhone.has(phoneKey(row.phone)));
  const incomingPeople = incoming.reduce((sum, row) => sum + (Number(row.invited) || 1), 0);
  await assertCanAddGuestsForEvent(req.user, event, incomingPeople);
  const created = [];
  const imageWarnings = [];
  let skipped = 0;
  let imagesUpdated = 0;
  const imageCol = columns.findIndex((col) => mapping[col] === "image");
  const images = fileBuffer ? await extractSheetImages(fileBuffer) : new Map();
  for (const row of mapped) {
    const key = phoneKey(row.phone);
    if (guestsByPhone.has(key)) {
      skipped += 1;
      const current = guestsByPhone.get(key);
      if (await storeImportedGuestImage(current, row, { images, imageCol, imageWarnings })) {
        imagesUpdated += 1;
      }
      await storeImportedEnlace(current, row);
      continue;
    }
    const guest = await Guest.create({
      eventId: event.id,
      rep: row.rep,
      phone: row.phone,
      invited: row.invited,
      table: row.table,
      family: row.family,
      guestType: row.guestType,
      notes: row.notes,
      tag: row.tag,
      customData: row.customData,
      status: "sin_contactar",
      whatsapp: "pendiente",
    });
    guestsByPhone.set(key, guest);
    await storeImportedGuestImage(guest, row, { images, imageCol, imageWarnings });
    created.push(guest);
  }
  if (importToken) await discardStagedSpreadsheet(importToken);
  await logActivity(event.id, `Se importaron ${created.length} invitaciones desde Excel`, "system");
  res.json({
    imported: created.length,
    skipped,
    discarded,
    imagesUpdated,
    imageWarnings,
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

