import { asyncHandler } from "../utils/async.js";
import { httpError } from "../utils/http-error.js";
import {
  EventWhatsappTemplate,
  WhatsappMessageTemplate,
} from "../models/index.js";
import { requireEvent, requirePermission, PERMS } from "../services/access.service.js";
import { resolveActiveWhatsappMetaByOwner } from "../services/whatsapp-meta.service.js";
import {
  createWizardTemplates,
  ensureEventWhatsappTemplates,
  listEventWhatsappTemplates,
  setCampaignSlot,
  submitEventTemplate,
} from "../services/whatsapp-templates.service.js";
import {
  bodyTextFromComponents,
  defaultSlotMappings,
} from "../services/whatsapp-template-slots.js";

function parsePayload(req) {
  if (typeof req.body?.payload !== "string") return req.body || {};
  try {
    return JSON.parse(req.body.payload);
  } catch {
    throw httpError(400, "El payload no contiene JSON válido.");
  }
}

function uploadedFile(file) {
  if (!file) return undefined;
  return {
    buffer: file.buffer,
    fileName: file.originalname,
    mime: file.mimetype,
    size: file.size,
  };
}

function fieldFile(req, name) {
  return req.files?.[name]?.[0] || (req.file?.fieldname === name ? req.file : undefined);
}

function normalizeWizardItems(payload, req) {
  if (!Array.isArray(payload?.templates) || payload.templates.length === 0) {
    throw httpError(400, "Debes crear una o dos plantillas.");
  }
  const items = payload.templates.map((item) => {
    const slot = Number(item?.slot);
    const body = String(item?.body || "");
    return {
      ...item,
      slot,
      headerType: String(item?.headerType || "none").toLowerCase(),
      body,
      isCampaign: Boolean(item?.isCampaign),
      slotMappings: item?.slotMappings || defaultSlotMappings(body),
      headerFile: uploadedFile(fieldFile(req, `header_${slot}`)),
    };
  });
  if (items.length === 1) items[0].isCampaign = true;
  return items;
}

function serializeTemplate(template) {
  return {
    id: template?.id ?? null,
    name: template?.name ?? null,
    metaTemplateId: template?.metaTemplateId ?? null,
    language: template?.language ?? null,
    category: template?.category ?? null,
    headerType: template?.headerType ?? "none",
    headerFileName: template?.headerFileName ?? null,
    status: template?.status ?? null,
    rejectedReason: template?.rejectedReason ?? null,
    body: bodyTextFromComponents(template?.components),
  };
}

function serializeLink(link) {
  return {
    id: link?.id ?? link?.template?.id ?? null,
    slot: Number(link?.slot),
    isCampaign: Boolean(link?.isCampaign),
    slotMappings: link?.slotMappings || {},
    template: serializeTemplate(link?.template),
  };
}

async function authorizedEvent(req, res) {
  const event = await requireEvent(req, res);
  if (!event) return null;
  if (!(await requirePermission(req, res, event, PERMS.CONFIG_AI))) return null;
  return event;
}

export const postWizardTemplates = asyncHandler(async (req, res) => {
  const payload = parsePayload(req);
  if (!Array.isArray(payload?.templates) || payload.templates.length === 0) {
    return res.status(400).json({ error: "Debes crear una o dos plantillas." });
  }
  const templates = normalizeWizardItems(payload, req);
  const resolved = await resolveActiveWhatsappMetaByOwner(req.user.id);
  const rows = await createWizardTemplates({
    ownerUserId: req.user.id,
    wabaId: resolved.credentials.wabaId,
    plannerAccessToken: resolved.credentials.accessToken,
    templates,
  });
  res.status(201).json({
    templates: rows.map((row, index) => serializeLink({
      id: row.id,
      ...templates[index],
      template: row,
    })),
  });
});

export const getEventWhatsappTemplates = asyncHandler(async (req, res) => {
  const event = await authorizedEvent(req, res);
  if (!event) return;
  await ensureEventWhatsappTemplates(event);
  const links = await listEventWhatsappTemplates(event.id);
  res.json({ templates: links.map(serializeLink) });
});

export const putEventWhatsappTemplate = asyncHandler(async (req, res) => {
  const event = await authorizedEvent(req, res);
  if (!event) return;
  const payload = parsePayload(req);
  const slot = req.params.slot;
  await submitEventTemplate({
    eventId: event.id,
    ownerUserId: event.ownerId,
    slot,
    body: payload.body,
    headerType: payload.headerType,
    headerFile: uploadedFile(fieldFile(req, "header")),
    slotMappings: payload.slotMappings,
    isCampaign: payload.isCampaign,
  });
  const link = await EventWhatsappTemplate.findOne({
    where: { eventId: event.id, slot: Number(slot) },
    include: [{ model: WhatsappMessageTemplate, as: "template", required: true }],
  });
  if (!link) throw httpError(404, "Plantilla del evento no encontrada.");
  res.json({ template: serializeLink(link) });
});

export const patchEventWhatsappTemplate = asyncHandler(async (req, res) => {
  const event = await authorizedEvent(req, res);
  if (!event) return;
  if (req.body?.isCampaign !== true) {
    throw httpError(400, "isCampaign debe ser true.");
  }
  const slot = Number(req.params.slot);
  if (![1, 2].includes(slot)) {
    throw httpError(400, "El slot de plantilla no es válido.");
  }
  const link = await EventWhatsappTemplate.findOne({
    where: { eventId: event.id, slot },
  });
  if (!link) {
    throw httpError(404, "Plantilla del evento no encontrada.");
  }
  await setCampaignSlot({ eventId: event.id, slot });
  res.json({ ok: true });
});
