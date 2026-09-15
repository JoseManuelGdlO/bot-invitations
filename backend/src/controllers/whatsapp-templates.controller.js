import { asyncHandler } from "../utils/async.js";
import { httpError } from "../utils/http-error.js";
import {
  EventWhatsappTemplate,
  WhatsappMessageTemplate,
} from "../models/index.js";
import { requireEvent, requirePermission, PERMS } from "../services/access.service.js";
import { resolveActiveWhatsappMetaByOwner } from "../services/whatsapp-meta.service.js";
import {
  attachEventTemplate,
  createEventCustomTemplate,
  createWizardTemplates,
  deleteOwnerTemplate,
  ensureEventWhatsappTemplates,
  listEventWhatsappTemplates,
  listOwnerTemplates,
  setCampaignSlot,
  submitEventTemplate,
} from "../services/whatsapp-templates.service.js";
import {
  bodyTextFromComponents,
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

function wizardItemFrom(item, req) {
  const slot = Number(item?.slot) || 1;
  return {
    displayName: item?.displayName,
    headerType: String(item?.headerType || "none").toLowerCase(),
    body: String(item?.body || ""),
    slotMappings: item?.slotMappings,
    headerFile: uploadedFile(
      fieldFile(req, "header_1") || fieldFile(req, `header_${slot}`),
    ),
  };
}

function normalizeWizardItem(payload, req) {
  if (Array.isArray(payload?.templates)) {
    if (payload.templates.length !== 1) {
      throw httpError(400, "Debes crear una plantilla.");
    }
    return wizardItemFrom(payload.templates[0], req);
  }
  if (payload && Object.prototype.hasOwnProperty.call(payload, "body")) {
    return wizardItemFrom(payload, req);
  }
  throw httpError(400, "Debes crear una plantilla.");
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

function serializeOwnerTemplate(template) {
  return {
    id: template?.id ?? null,
    displayName: null,
    name: template?.name ?? null,
    status: template?.status ?? null,
    headerType: template?.headerType ?? "none",
    body: bodyTextFromComponents(template?.components),
    isWabaDefault: Boolean(template?.isWabaDefault),
    rejectedReason: template?.rejectedReason ?? null,
    createdAt: template?.createdAt ?? null,
    usage: template?.usage || {
      eventCount: 0,
      campaignEventCount: 0,
      events: [],
    },
  };
}

function serializeLink(link) {
  return {
    id: link?.id ?? null,
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
  let item;
  try {
    item = normalizeWizardItem(payload, req);
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    throw error;
  }
  const resolved = await resolveActiveWhatsappMetaByOwner(req.user.id);
  const result = await createWizardTemplates({
    ownerUserId: req.user.id,
    wabaId: resolved.credentials.wabaId,
    plannerAccessToken: resolved.credentials.accessToken,
    displayName: item.displayName,
    headerType: item.headerType,
    body: item.body,
    slotMappings: item.slotMappings,
    headerFile: item.headerFile,
  });
  res.status(201).json({
    templates: [serializeLink({
      id: null,
      slot: 1,
      isCampaign: true,
      slotMappings: result.slotMappings,
      template: result.template,
    })],
  });
});

export const getOwnerWhatsappTemplates = asyncHandler(async (req, res) => {
  const templates = await listOwnerTemplates(req.user.id);
  res.json({ templates: templates.map(serializeOwnerTemplate) });
});

export const deleteOwnerWhatsappTemplate = asyncHandler(async (req, res) => {
  await deleteOwnerTemplate({
    ownerUserId: req.user.id,
    templateId: req.params.id,
  });
  res.status(204).send();
});

export const postEventWhatsappTemplate = asyncHandler(async (req, res) => {
  const event = await authorizedEvent(req, res);
  if (!event) return;
  const payload = parsePayload(req);
  const result = await createEventCustomTemplate({
    eventId: event.id,
    ownerUserId: event.ownerId,
    source: payload.source,
    templateId: payload.templateId,
    displayName: payload.displayName,
    body: payload.body,
    headerType: payload.headerType,
    headerFile: uploadedFile(fieldFile(req, "header")),
    slotMappings: payload.slotMappings,
  });
  res.status(201).json({ template: serializeLink(result.link) });
});

export const attachEventWhatsappTemplate = asyncHandler(async (req, res) => {
  const event = await authorizedEvent(req, res);
  if (!event) return;
  const result = await attachEventTemplate({
    eventId: event.id,
    ownerUserId: event.ownerId,
    templateId: req.body?.templateId,
  });
  res.status(201).json({ template: serializeLink(result.link) });
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
  if (!Number.isInteger(slot) || slot < 1) {
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
