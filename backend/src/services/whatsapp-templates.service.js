import fs from "node:fs";
import path from "node:path";
import { Op } from "sequelize";
import {
  Campaign,
  Event,
  EventWhatsappTemplate,
  WhatsappMessageTemplate,
} from "../models/index.js";
import { eventGuestVars } from "../utils/defaults.js";
import { httpError } from "../utils/http-error.js";
import {
  createMessageTemplate,
  deleteMessageTemplate,
  resolveTemplateCrudToken,
  updateMessageTemplate,
  uploadResumableHeader,
} from "./meta-graph.client.js";
import {
  assertMetaTemplateBody,
  assertSlotMappingsComplete,
  assertWizardBody,
  bodyTextFromComponents,
  buildTemplateComponents,
  exampleValuesFromMappings,
  generateTemplateName,
  mergeSlotMappings,
  resolveSlotParamValues,
} from "./whatsapp-template-slots.js";
import { resolveActiveWhatsappMetaByOwner } from "./whatsapp-meta.service.js";
import { Logger } from "../utils/logger.js";

const log = new Logger("WhatsAppTemplates");
const TEMPLATE_LANGUAGE = "es_MX";
const TEMPLATE_CATEGORY = "MARKETING";
const EVENT_TEMPLATE_CAP = 10;
const HEADER_TYPES = new Set(["none", "document", "image"]);
const WIZARD_UNIVERSAL_FIELDS = new Set([
  "nombre",
  "numero_invitados",
  "evento",
  "fecha",
  "lugar",
  "direccion",
  "hora",
  "planner",
  "nombre_completo",
]);
const TEMPLATE_STATUS_EVENTS = new Set([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "PAUSED",
  "DISABLED",
]);

export function mapTemplateStatusEvent(event) {
  const normalized = String(event || "").trim().toUpperCase();
  if (normalized === "FLAGGED") return "PAUSED";
  return TEMPLATE_STATUS_EVENTS.has(normalized) ? normalized : null;
}

export async function applyTemplateStatusUpdate(update = {}) {
  const status = mapTemplateStatusEvent(update.event);
  if (!status) {
    return { processed: true, reason: "unknown_event" };
  }

  const metaTemplateId = String(update.metaTemplateId || "").trim();
  const where = metaTemplateId
    ? { metaTemplateId }
    : {
      wabaId: String(update.wabaId || "").trim(),
      name: String(update.name || "").trim(),
    };
  const template = await WhatsappMessageTemplate.findOne({ where });
  if (!template) {
    log.warn("plantilla desconocida en webhook de estado", {
      wabaId: String(update.wabaId || "").trim() || null,
      metaTemplateId: metaTemplateId || null,
      name: String(update.name || "").trim() || null,
    });
    return { processed: true, reason: "unknown_template" };
  }

  await template.update({
    status,
    rejectedReason: status === "REJECTED" ? update.reason || null : null,
    lastStatusAt: new Date(),
  });
  return {
    processed: true,
    reason: "template_status_updated",
    templateId: template.id,
    status,
  };
}

function normalizeWizardInput(input = {}) {
  if (Array.isArray(input.templates)) {
    if (input.templates.length !== 1) {
      throw httpError(400, "Debes crear una plantilla.");
    }
    const item = input.templates[0] || {};
    return {
      ownerUserId: input.ownerUserId,
      wabaId: input.wabaId,
      plannerAccessToken: input.plannerAccessToken,
      displayName: item.displayName ?? input.displayName,
      headerType: item.headerType ?? input.headerType,
      body: item.body ?? input.body,
      slotMappings: item.slotMappings ?? input.slotMappings,
      headerFile: item.headerFile ?? input.headerFile,
    };
  }
  return input;
}

function validateWizardTemplate(input) {
  const headerType = String(input?.headerType || "none").toLowerCase();
  if (!HEADER_TYPES.has(headerType)) {
    throw httpError(400, "El tipo de encabezado no es válido.");
  }

  const body = String(input?.body || "");
  assertWizardBody(body);
  const slotMappings = assertSlotMappingsComplete(
    body,
    mergeSlotMappings(body, input?.slotMappings || {}),
  );
  for (const [id, mapping] of Object.entries(slotMappings)) {
    if (id === "1" || id === "2") continue;
    if (mapping?.type !== "field" || !WIZARD_UNIVERSAL_FIELDS.has(String(mapping.key || ""))) {
      throw httpError(
        400,
        "Las variables extra del default solo pueden mapear a campos universales.",
      );
    }
  }

  return {
    headerType,
    body,
    slotMappings,
    headerFile: headerType === "none" ? null : input?.headerFile || null,
  };
}

function bodyExampleValuesFromComponents(components) {
  const body = (components || []).find((c) => String(c?.type || "").toUpperCase() === "BODY");
  return body?.example?.body_text?.[0] ?? null;
}

function wizardContentUnchanged(existing, { body, headerType, headerFile, slotMappings }) {
  if (bodyTextFromComponents(existing?.components) !== body) return false;
  if (String(existing?.headerType || "none").toLowerCase() !== headerType) return false;
  if (headerType !== "none" && headerFile) return false;
  const existingExamples = bodyExampleValuesFromComponents(existing?.components);
  const nextExamples = exampleValuesFromMappings(slotMappings);
  if (JSON.stringify(existingExamples) !== JSON.stringify(nextExamples)) return false;
  return true;
}

function isDuplicateNameError(error) {
  const details = [
    error?.message,
    error?.code,
    error?.meta?.message,
    error?.meta?.code,
  ].filter(Boolean).join(" ");
  return /duplicate|already\s+exists|unique|name\s+collision/i.test(details);
}

async function createOnMeta({
  wabaId,
  token,
  slot,
  components,
  language = TEMPLATE_LANGUAGE,
  category = TEMPLATE_CATEGORY,
  initialName,
}) {
  let name = initialName || generateTemplateName(slot);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const payload = {
      name,
      language,
      category,
      parameter_format: "POSITIONAL",
      components,
    };
    try {
      const result = await createMessageTemplate({ wabaId, token, payload });
      return { metaTemplateId: result.id, name };
    } catch (error) {
      if (attempt === 1 || !isDuplicateNameError(error)) throw error;
      name = generateTemplateName(slot);
    }
  }
  throw new Error("No se pudo crear la plantilla.");
}

async function persistHeaderFile({ ownerUserId, template, headerFile }) {
  if (!headerFile) return null;
  const fileName = path.basename(String(headerFile.fileName || "header"));
  const relativePath = path.posix.join(
    "template-headers",
    String(ownerUserId),
    String(template.id),
    fileName,
  );
  const absolutePath = path.resolve(process.cwd(), "uploads", relativePath);
  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.promises.writeFile(absolutePath, headerFile.buffer);
  await template.update({ headerMediaPath: relativePath });
  return relativePath;
}

async function findReusableWizardDefault({ ownerUserId, wabaId }) {
  const defaults = await WhatsappMessageTemplate.findAll({
    where: { ownerUserId, wabaId, isWabaDefault: true },
    order: [["createdAt", "ASC"]],
  });
  return defaults.find((row) => String(row?.status || "").toUpperCase() !== "REJECTED") || null;
}

export async function attachDefaultToOwnerEvents(ownerUserId, templateId, slotMappings) {
  const events = await Event.findAll({ where: { ownerId: ownerUserId } });
  if (!events.length) return;
  const links = await EventWhatsappTemplate.findAll({
    where: { eventId: events.map((event) => event.id) },
  });
  const linksByEvent = new Map();
  for (const link of links) {
    const list = linksByEvent.get(link.eventId) || [];
    list.push(link);
    linksByEvent.set(link.eventId, list);
  }
  for (const event of events) {
    const eventLinks = linksByEvent.get(event.id) || [];
    if (eventLinks.some((link) => Boolean(link.isCampaign))) continue;
    const slots = eventLinks
      .map((link) => Number(link.slot))
      .filter((slot) => Number.isFinite(slot));
    const slot = slots.length === 0 ? 1 : Math.max(...slots) + 1;
    await EventWhatsappTemplate.create({
      eventId: event.id,
      whatsappMessageTemplateId: templateId,
      ownerUserId,
      slot,
      isCampaign: true,
      slotMappings,
    });
  }
}

export async function createWizardTemplates(input) {
  const normalized = normalizeWizardInput(input);
  const validated = validateWizardTemplate(normalized);
  const { ownerUserId, wabaId, plannerAccessToken } = normalized;
  const token = resolveTemplateCrudToken(plannerAccessToken);
  const existing = await findReusableWizardDefault({ ownerUserId, wabaId });

  if (existing && wizardContentUnchanged(existing, validated)) {
    await attachDefaultToOwnerEvents(ownerUserId, existing.id, validated.slotMappings);
    return { template: existing, slotMappings: validated.slotMappings };
  }

  const header = await editableHeader({
    template: existing,
    headerType: validated.headerType,
    headerFile: validated.headerFile,
    token,
  });
  const components = buildTemplateComponents({
    headerType: validated.headerType,
    headerHandle: header.headerHandle,
    bodyText: validated.body,
    exampleValues: exampleValuesFromMappings(validated.slotMappings),
  });

  if (existing) {
    await updateMessageTemplate({
      templateId: existing.metaTemplateId,
      token,
      payload: {
        components,
        language: existing.language || TEMPLATE_LANGUAGE,
        category: existing.category || TEMPLATE_CATEGORY,
      },
    });
    await existing.update(localTemplateFields({
      headerType: validated.headerType,
      header,
      components,
    }));
    if (header.headerFile) {
      await persistHeaderFile({
        ownerUserId,
        template: existing,
        headerFile: header.headerFile,
      });
    }
    await attachDefaultToOwnerEvents(ownerUserId, existing.id, validated.slotMappings);
    return { template: existing, slotMappings: validated.slotMappings };
  }

  const meta = await createOnMeta({
    wabaId,
    token,
    slot: 1,
    components,
  });
  const row = await WhatsappMessageTemplate.create({
    ownerUserId,
    wabaId,
    metaTemplateId: meta.metaTemplateId,
    name: meta.name,
    language: TEMPLATE_LANGUAGE,
    category: TEMPLATE_CATEGORY,
    headerType: validated.headerType,
    headerMediaPath: header.headerMediaPath,
    headerFileName: header.headerFileName,
    headerMime: header.headerMime,
    headerSize: header.headerSize,
    headerHandle: header.headerHandle,
    components,
    status: "PENDING",
    isWabaDefault: true,
  });
  if (header.headerFile) {
    await persistHeaderFile({ ownerUserId, template: row, headerFile: header.headerFile });
  }
  await attachDefaultToOwnerEvents(ownerUserId, row.id, validated.slotMappings);
  return { template: row, slotMappings: validated.slotMappings };
}

async function currentOwnerWabaId(ownerUserId) {
  try {
    const { credentials } = await resolveActiveWhatsappMetaByOwner(ownerUserId);
    return String(credentials?.wabaId || "").trim() || null;
  } catch {
    return null;
  }
}

function isTemplateStatus(row, status) {
  return String(row?.status || "").toUpperCase() === status;
}

async function promoteCurrentWabaDefault({ ownerUserId, wabaId }) {
  const hsms = await WhatsappMessageTemplate.findAll({
    where: { ownerUserId, wabaId },
    order: [["createdAt", "ASC"]],
  });
  const pick = hsms.find((row) => isTemplateStatus(row, "APPROVED"))
    || hsms.find((row) => isTemplateStatus(row, "PENDING"))
    || null;
  if (!pick) return null;
  await pick.update({ isWabaDefault: true });
  return pick;
}

function emptyUsage() {
  return { eventCount: 0, campaignEventCount: 0, events: [] };
}

function eventFromTemplateLink(link) {
  return link?.Event || link?.event || null;
}

function usageByTemplateId(links = []) {
  const usage = new Map();
  for (const link of links) {
    const templateId = link.whatsappMessageTemplateId;
    if (!templateId) continue;
    const current = usage.get(templateId) || {
      eventIds: new Set(),
      campaignEventIds: new Set(),
      events: [],
    };
    const event = eventFromTemplateLink(link);
    if (event?.id && !current.eventIds.has(event.id)) {
      current.eventIds.add(event.id);
      current.events.push({ id: event.id, name: event.name });
    }
    if (link.isCampaign && event?.id) {
      current.campaignEventIds.add(event.id);
    }
    usage.set(templateId, current);
  }
  return usage;
}

function serializeUsage(entry) {
  if (!entry) return emptyUsage();
  return {
    eventCount: entry.eventIds.size,
    campaignEventCount: entry.campaignEventIds.size,
    events: entry.events,
  };
}

export async function listOwnerTemplates(ownerUserId) {
  const { credentials } = await resolveActiveWhatsappMetaByOwner(ownerUserId);
  const wabaId = String(credentials?.wabaId || "").trim();
  if (!wabaId) throw httpError(400, "WhatsApp (Meta) no está configurado.");

  const defaults = await WhatsappMessageTemplate.findAll({
    where: { ownerUserId, wabaId, isWabaDefault: true },
  });
  if (!defaults.length) {
    await promoteCurrentWabaDefault({ ownerUserId, wabaId });
  }

  const templates = await WhatsappMessageTemplate.findAll({
    where: { ownerUserId, wabaId },
    order: [["createdAt", "ASC"]],
  });
  const links = templates.length
    ? await EventWhatsappTemplate.findAll({
      where: { whatsappMessageTemplateId: templates.map((row) => row.id) },
      include: [{ model: Event }],
    })
    : [];
  const usage = usageByTemplateId(links);
  return templates.map((row) => Object.assign(row, {
    usage: serializeUsage(usage.get(row.id)),
  }));
}

function campaignUsesTemplate(link, template) {
  return link.whatsappMessageTemplateId === template.id
    || link.template?.id === template.id
    || link.template?.name === template.name;
}

async function assertNoActiveCampaignUsingTemplate({ ownerUserId, template }) {
  const campaigns = await Campaign.findAll({
    where: { status: { [Op.in]: ["queued", "running"] } },
    include: [{
      model: Event,
      required: true,
      where: { ownerId: ownerUserId },
    }],
  });
  const eventIds = [...new Set(campaigns.map((row) => row.eventId).filter(Boolean))];
  if (!eventIds.length) return;

  const links = await EventWhatsappTemplate.findAll({
    where: { eventId: eventIds, isCampaign: true },
    include: [{ model: WhatsappMessageTemplate, as: "template", required: true }],
  });
  if (links.some((link) => campaignUsesTemplate(link, template))) {
    throw httpError(
      409,
      "No se puede borrar la plantilla mientras hay una campaña en cola o en curso que la usa.",
    );
  }
}

function isCampaignCapableStatus(row) {
  return isTemplateStatus(row, "APPROVED") || isTemplateStatus(row, "PENDING");
}

async function assertNotLastDiscoveredDefault({ ownerUserId, wabaId, template }) {
  let defaults = await WhatsappMessageTemplate.findAll({
    where: { ownerUserId, wabaId, isWabaDefault: true },
  });
  if (!defaults.length) {
    const promoted = await promoteCurrentWabaDefault({ ownerUserId, wabaId });
    defaults = promoted ? [promoted] : [];
  }
  const isOnlyDefault = defaults.length === 1 && defaults[0].id === template.id;
  if (!isOnlyDefault) return;

  const events = await Event.findAll({ where: { ownerId: ownerUserId } });
  if (!events.length) return;

  const otherLinks = await EventWhatsappTemplate.findAll({
    where: {
      eventId: events.map((event) => event.id),
      whatsappMessageTemplateId: { [Op.ne]: template.id },
    },
    include: [{ model: WhatsappMessageTemplate, as: "template", required: true }],
  });
  const covered = new Set();
  for (const link of otherLinks) {
    if (isCampaignCapableStatus(link.template)) covered.add(link.eventId);
  }
  if (events.some((event) => !covered.has(event.id))) {
    throw httpError(
      409,
      "No se puede dejar eventos sin plantilla de primer contacto; primero crea otra o asígnala",
    );
  }
}

async function reattachDefaultAfterCustomDelete(ownerUserId, wabaId) {
  const accountDefault = await findReusableWizardDefault({ ownerUserId, wabaId });
  if (!accountDefault || !isCampaignCapableStatus(accountDefault)) return;

  const existingLink = await EventWhatsappTemplate.findOne({
    where: { whatsappMessageTemplateId: accountDefault.id },
  });
  const slotMappings = existingLink?.slotMappings
    || mergeSlotMappings(bodyTextFromComponents(accountDefault.components), {});
  await attachDefaultToOwnerEvents(ownerUserId, accountDefault.id, slotMappings);
}

export async function deleteOwnerTemplate({ ownerUserId, templateId } = {}) {
  const { credentials } = await resolveActiveWhatsappMetaByOwner(ownerUserId);
  const wabaId = String(credentials?.wabaId || "").trim();
  if (!wabaId) throw httpError(400, "WhatsApp (Meta) no está configurado.");
  const token = resolveTemplateCrudToken(credentials.accessToken);

  const template = await WhatsappMessageTemplate.findOne({
    where: { id: templateId, ownerUserId, wabaId },
  });
  if (!template) throw httpError(404, "Plantilla no encontrada.");

  await assertNoActiveCampaignUsingTemplate({ ownerUserId, template });
  await assertNotLastDiscoveredDefault({ ownerUserId, wabaId, template });

  await deleteMessageTemplate({
    wabaId,
    token,
    name: template.name,
    metaTemplateId: template.metaTemplateId,
  });

  await EventWhatsappTemplate.destroy({
    where: { whatsappMessageTemplateId: template.id },
  });
  await template.destroy();

  if (!template.isWabaDefault) {
    await reattachDefaultAfterCustomDelete(ownerUserId, wabaId);
  }
}

async function sourceTemplatesFor(event) {
  const wabaId = await currentOwnerWabaId(event.ownerId);
  if (!wabaId) return { templates: [], links: [] };

  let defaults = await WhatsappMessageTemplate.findAll({
    where: { ownerUserId: event.ownerId, isWabaDefault: true, wabaId },
    order: [["createdAt", "ASC"]],
  });
  if (!defaults.length) {
    const promoted = await promoteCurrentWabaDefault({
      ownerUserId: event.ownerId,
      wabaId,
    });
    defaults = promoted ? [promoted] : [];
  }
  if (!defaults.length) return { templates: [], links: [] };

  const links = await EventWhatsappTemplate.findAll({
    where: {
      whatsappMessageTemplateId: defaults.map((template) => template.id),
    },
    order: [["slot", "ASC"]],
  });
  return { templates: defaults, links };
}

function sourceLinkFor(template, links) {
  return links.find(
    (link) => link.whatsappMessageTemplateId === template.id,
  ) || null;
}

async function cloneHeader(origin, token) {
  if (origin.headerType === "none" || !origin.headerMediaPath) {
    return {
      components: structuredClone(origin.components || []),
      headerFile: null,
      headerHandle: origin.headerHandle || null,
    };
  }
  const absolutePath = path.resolve(process.cwd(), "uploads", origin.headerMediaPath);
  const buffer = await fs.promises.readFile(absolutePath);
  const headerHandle = await uploadResumableHeader({
    token,
    fileName: origin.headerFileName,
    fileLength: origin.headerSize ?? buffer.length,
    fileType: origin.headerMime,
    buffer,
  });
  const components = structuredClone(origin.components || []);
  const header = components.find(
    (component) => String(component?.type || "").toUpperCase() === "HEADER",
  );
  if (header) header.example = { ...(header.example || {}), header_handle: [headerHandle] };
  return {
    components,
    headerHandle,
    headerFile: {
      fileName: origin.headerFileName,
      size: origin.headerSize ?? buffer.length,
      mime: origin.headerMime,
      buffer,
    },
  };
}

async function resolveOwnerTemplateToken(ownerUserId) {
  const { credentials } = await resolveActiveWhatsappMetaByOwner(ownerUserId);
  return resolveTemplateCrudToken(credentials.accessToken);
}

export async function ensureEventWhatsappTemplates(event) {
  const existing = await EventWhatsappTemplate.findAll({
    where: { eventId: event.id },
    include: [{ model: WhatsappMessageTemplate, as: "template" }],
    order: [["slot", "ASC"]],
  });
  const source = await sourceTemplatesFor(event);
  if (!source.templates.length) {
    return { attached: false, cloned: false, links: existing };
  }

  const candidates = source.templates.map((template, index) => {
    const sourceLink = sourceLinkFor(template, source.links);
    return {
      template,
      sourceLink,
      slot: sourceLink?.slot ?? index + 1,
      index,
    };
  });
  const existingSlots = new Set(existing.map((link) => link.slot));
  const missing = candidates.filter(({ slot }) => !existingSlots.has(slot));
  if (!missing.length) {
    return { attached: false, cloned: false, links: existing };
  }

  const links = [...existing];
  for (const { template: origin, sourceLink, slot, index } of missing) {
    links.push(await EventWhatsappTemplate.create({
      eventId: event.id,
      whatsappMessageTemplateId: origin.id,
      ownerUserId: event.ownerId,
      slot,
      isCampaign: sourceLink?.isCampaign ?? index === 0,
      slotMappings: sourceLink?.slotMappings || {},
    }));
  }
  return { attached: true, cloned: false, links };
}

function missingCampaignTemplateError() {
  return httpError(
    400,
    "Crea una plantilla de primer contacto y espera la aprobación de Meta.",
  );
}

function assertLinkedTemplateReady(link) {
  if (!link?.template) throw missingCampaignTemplateError();
  if (link.template.status !== "APPROVED") {
    throw httpError(400, "Meta aún no aprueba la plantilla de campaña.");
  }
  if (
    ["document", "image"].includes(link.template.headerType)
    && !link.template.headerMediaPath
  ) {
    throw httpError(400, "La plantilla de campaña requiere un archivo de encabezado.");
  }
  return link;
}

function eventFromLink(link) {
  return link?.Event || link?.event || null;
}

function sendContextFrom(link, event) {
  const { template } = link;
  const header = template.headerMediaPath
    ? {
      relativePath: template.headerMediaPath,
      fileName: template.headerFileName || path.basename(template.headerMediaPath),
      mime: template.headerMime || null,
    }
    : null;
  const eventId = event?.id || link.eventId || null;

  return {
    template,
    link,
    hsmTemplateName: template.name,
    async hsmParamsFor(guest, plannerName) {
      return resolveSlotParamValues(
        link.slotMappings || {},
        eventGuestVars(event || {}, guest, plannerName),
      );
    },
    hsmHeaderDocument: template.headerType === "document"
      ? { ...header, ...(eventId ? { eventId } : {}) }
      : null,
    hsmHeaderImage: template.headerType === "image" ? header : null,
  };
}

export async function assertCampaignTemplateReady(event) {
  await ensureEventWhatsappTemplates(event);
  const link = await EventWhatsappTemplate.findOne({
    where: { eventId: event.id, isCampaign: true },
    include: [{ model: WhatsappMessageTemplate, as: "template", required: true }],
  });
  if (!link) throw missingCampaignTemplateError();
  return assertLinkedTemplateReady(link);
}

export async function resolveCampaignSendContext(event) {
  const link = await assertCampaignTemplateReady(event);
  return sendContextFrom(link, event);
}

export async function resolveOwnerCampaignSendContext({ ownerUserId, wabaId } = {}) {
  const currentWabaId = String(wabaId || "").trim();
  if (!currentWabaId) throw missingCampaignTemplateError();

  const campaignLink = await EventWhatsappTemplate.findOne({
    where: { isCampaign: true },
    include: [
      { model: Event, required: true, where: { ownerId: ownerUserId } },
      {
        model: WhatsappMessageTemplate,
        as: "template",
        required: true,
        where: { wabaId: currentWabaId },
      },
    ],
    order: [[{ model: Event }, "createdAt", "DESC"]],
  });
  if (campaignLink) {
    assertLinkedTemplateReady(campaignLink);
    return sendContextFrom(campaignLink, eventFromLink(campaignLink));
  }

  throw missingCampaignTemplateError();
}

export async function listEventWhatsappTemplates(eventId) {
  const event = await Event.findByPk(eventId);
  if (!event) return [];
  await ensureEventWhatsappTemplates(event);
  return EventWhatsappTemplate.findAll({
    where: { eventId },
    include: [{ model: WhatsappMessageTemplate, as: "template", required: true }],
    order: [["slot", "ASC"]],
  });
}

export async function setCampaignSlot({ eventId, slot }) {
  await EventWhatsappTemplate.update(
    { isCampaign: false },
    { where: { eventId } },
  );
  await EventWhatsappTemplate.update(
    { isCampaign: true },
    { where: { eventId, slot } },
  );
}

async function editableHeader({ template, headerType, headerFile, token }) {
  if (headerType === "none") {
    return {
      headerHandle: null,
      headerFile: null,
      headerMediaPath: null,
      headerFileName: null,
      headerMime: null,
      headerSize: null,
    };
  }

  if (headerFile) {
    const headerHandle = await uploadResumableHeader({
      token,
      fileName: headerFile.fileName,
      fileLength: headerFile.size,
      fileType: headerFile.mime,
      buffer: headerFile.buffer,
    });
    return {
      headerHandle,
      headerFile,
      headerMediaPath: null,
      headerFileName: headerFile.fileName,
      headerMime: headerFile.mime,
      headerSize: headerFile.size,
    };
  }

  if (template?.headerHandle) {
    return {
      headerHandle: template.headerHandle,
      headerFile: null,
      headerMediaPath: template.headerMediaPath || null,
      headerFileName: template.headerFileName || null,
      headerMime: template.headerMime || null,
      headerSize: template.headerSize ?? null,
    };
  }

  if (template?.headerMediaPath) {
    const absolutePath = path.resolve(process.cwd(), "uploads", template.headerMediaPath);
    const buffer = await fs.promises.readFile(absolutePath);
    const headerHandle = await uploadResumableHeader({
      token,
      fileName: template.headerFileName || path.basename(template.headerMediaPath),
      fileLength: template.headerSize ?? buffer.length,
      fileType: template.headerMime,
      buffer,
    });
    return {
      headerHandle,
      headerFile: null,
      headerMediaPath: template.headerMediaPath,
      headerFileName: template.headerFileName || path.basename(template.headerMediaPath),
      headerMime: template.headerMime || null,
      headerSize: template.headerSize ?? buffer.length,
    };
  }

  throw httpError(400, "La plantilla requiere un archivo de encabezado.");
}

function localTemplateFields({
  headerType,
  header,
  components,
  bodyStatus = "PENDING",
}) {
  return {
    headerType,
    headerMediaPath: header.headerMediaPath,
    headerFileName: header.headerFileName,
    headerMime: header.headerMime,
    headerSize: header.headerSize,
    headerHandle: header.headerHandle,
    components,
    status: bodyStatus,
    rejectedReason: null,
  };
}

function assertValidEventSlot(slot) {
  const numericSlot = Number(slot);
  if (!Number.isInteger(numericSlot) || numericSlot < 1) {
    throw httpError(400, "El slot de plantilla no es válido.");
  }
  return numericSlot;
}

async function requireOwnedEvent(eventId, ownerUserId) {
  const event = await Event.findOne({
    where: { id: eventId, ownerId: ownerUserId },
  });
  if (!event) throw httpError(404, "Evento no encontrado.");
  return event;
}

function nextEventSlot(links = []) {
  const slots = links
    .map((link) => Number(link.slot))
    .filter((slot) => Number.isInteger(slot) && slot >= 1);
  return slots.length === 0 ? 1 : Math.max(...slots) + 1;
}

async function loadEventTemplateLinks(eventId) {
  const links = await EventWhatsappTemplate.findAll({ where: { eventId } });
  if (links.length >= EVENT_TEMPLATE_CAP) {
    throw httpError(400, "El evento ya tiene el máximo de 10 plantillas.");
  }
  return links;
}

async function resolveCustomOrigin({ source, templateId, ownerUserId, wabaId }) {
  const normalized = String(source || "").trim().toLowerCase();
  if (normalized === "blank") return null;
  if (normalized === "default") {
    const origin = await findReusableWizardDefault({ ownerUserId, wabaId });
    if (!origin) throw httpError(404, "No hay plantilla default en este WABA.");
    return origin;
  }
  if (normalized === "library") {
    const id = String(templateId || "").trim();
    if (!id) throw httpError(400, "Falta templateId.");
    const origin = await WhatsappMessageTemplate.findOne({
      where: { id, ownerUserId, wabaId },
    });
    if (!origin) throw httpError(404, "Plantilla no encontrada.");
    return origin;
  }
  throw httpError(400, "El origen de la plantilla no es válido.");
}

async function headerForCustomClone({ origin, headerType, headerFile, token }) {
  if (headerFile) {
    return editableHeader({ template: origin, headerType, headerFile, token });
  }
  if (origin && headerType !== "none") {
    const cloned = await cloneHeader(origin, token);
    return {
      headerHandle: cloned.headerHandle,
      headerFile: cloned.headerFile,
      headerMediaPath: origin.headerMediaPath || null,
      headerFileName: origin.headerFileName || null,
      headerMime: origin.headerMime || null,
      headerSize: origin.headerSize ?? null,
    };
  }
  return editableHeader({ template: origin, headerType, headerFile: null, token });
}

async function originSlotMappings(origin) {
  if (!origin?.id) return {};
  const originLink = await EventWhatsappTemplate.findOne({
    where: { whatsappMessageTemplateId: origin.id },
  });
  return originLink?.slotMappings || {};
}

function linkResult(link, template) {
  return {
    template,
    link: {
      id: link.id,
      eventId: link.eventId,
      slot: link.slot,
      isCampaign: Boolean(link.isCampaign),
      slotMappings: link.slotMappings,
      whatsappMessageTemplateId: link.whatsappMessageTemplateId,
      template,
    },
  };
}

export async function createEventCustomTemplate({
  eventId,
  ownerUserId,
  source,
  templateId,
  body,
  headerType,
  headerFile,
  slotMappings,
}) {
  await requireOwnedEvent(eventId, ownerUserId);
  const { credentials } = await resolveActiveWhatsappMetaByOwner(ownerUserId);
  const wabaId = String(credentials?.wabaId || "").trim();
  if (!wabaId) throw httpError(400, "WhatsApp (Meta) no está configurado.");
  const token = resolveTemplateCrudToken(credentials.accessToken);

  const links = await loadEventTemplateLinks(eventId);
  const origin = await resolveCustomOrigin({
    source,
    templateId,
    ownerUserId,
    wabaId,
  });

  const resolvedBody = String(body || "").trim()
    ? String(body)
    : bodyTextFromComponents(origin?.components);
  const resolvedHeaderType = String(
    headerType != null && String(headerType).trim() !== ""
      ? headerType
      : origin?.headerType || "none",
  ).toLowerCase();
  if (!HEADER_TYPES.has(resolvedHeaderType)) {
    throw httpError(400, "El tipo de encabezado no es válido.");
  }

  assertMetaTemplateBody(resolvedBody);
  const mappings = assertSlotMappingsComplete(
    resolvedBody,
    mergeSlotMappings(
      resolvedBody,
      slotMappings ?? await originSlotMappings(origin),
    ),
  );

  const header = await headerForCustomClone({
    origin,
    headerType: resolvedHeaderType,
    headerFile,
    token,
  });
  const components = buildTemplateComponents({
    headerType: resolvedHeaderType,
    headerHandle: header.headerHandle,
    bodyText: resolvedBody,
    exampleValues: exampleValuesFromMappings(mappings),
  });
  const slot = nextEventSlot(links);
  const meta = await createOnMeta({
    wabaId,
    token,
    slot,
    components,
  });
  const template = await WhatsappMessageTemplate.create({
    ownerUserId,
    wabaId,
    metaTemplateId: meta.metaTemplateId,
    name: meta.name,
    language: TEMPLATE_LANGUAGE,
    category: TEMPLATE_CATEGORY,
    ...localTemplateFields({
      headerType: resolvedHeaderType,
      header,
      components,
    }),
    isWabaDefault: false,
    clonedFromId: origin?.id || null,
  });
  if (header.headerFile) {
    await persistHeaderFile({ ownerUserId, template, headerFile: header.headerFile });
  }
  const link = await EventWhatsappTemplate.create({
    eventId,
    whatsappMessageTemplateId: template.id,
    ownerUserId,
    slot,
    isCampaign: false,
    slotMappings: mappings,
  });
  return linkResult(link, template);
}

export async function attachEventTemplate({ eventId, ownerUserId, templateId }) {
  await requireOwnedEvent(eventId, ownerUserId);
  const { credentials } = await resolveActiveWhatsappMetaByOwner(ownerUserId);
  const wabaId = String(credentials?.wabaId || "").trim();
  if (!wabaId) throw httpError(400, "WhatsApp (Meta) no está configurado.");

  const id = String(templateId || "").trim();
  if (!id) throw httpError(400, "Falta templateId.");
  const template = await WhatsappMessageTemplate.findOne({
    where: { id, ownerUserId, wabaId },
  });
  if (!template) throw httpError(404, "Plantilla no encontrada.");

  const duplicate = await EventWhatsappTemplate.findOne({
    where: { eventId, whatsappMessageTemplateId: template.id },
  });
  if (duplicate) {
    throw httpError(409, "Esta plantilla ya está vinculada al evento.");
  }

  const links = await loadEventTemplateLinks(eventId);
  const sourceLink = await EventWhatsappTemplate.findOne({
    where: { whatsappMessageTemplateId: template.id },
  });
  const bodyText = bodyTextFromComponents(template.components);
  const mappings = assertSlotMappingsComplete(
    bodyText,
    mergeSlotMappings(bodyText, sourceLink?.slotMappings || {}),
  );
  const link = await EventWhatsappTemplate.create({
    eventId,
    whatsappMessageTemplateId: template.id,
    ownerUserId,
    slot: nextEventSlot(links),
    isCampaign: false,
    slotMappings: mappings,
  });
  return linkResult(link, template);
}

export async function submitEventTemplate({
  eventId,
  ownerUserId,
  slot,
  body,
  headerType,
  headerFile,
  slotMappings,
  isCampaign,
}) {
  const numericSlot = assertValidEventSlot(slot);
  const normalizedHeaderType = String(headerType || "none").toLowerCase();
  if (!HEADER_TYPES.has(normalizedHeaderType)) {
    throw httpError(400, "El tipo de encabezado no es válido.");
  }

  const event = await Event.findOne({
    where: { id: eventId, ownerId: ownerUserId },
  });
  if (!event) throw httpError(404, "Evento no encontrado.");

  await ensureEventWhatsappTemplates(event);
  let pivot = await EventWhatsappTemplate.findOne({
    where: { eventId, slot: numericSlot },
    include: [{ model: WhatsappMessageTemplate, as: "template" }],
  });
  let template = pivot?.template || null;

  const bodyText = String(body || "");
  assertWizardBody(bodyText);
  const mappings = assertSlotMappingsComplete(
    bodyText,
    mergeSlotMappings(bodyText, slotMappings || {}),
  );
  const token = await resolveOwnerTemplateToken(ownerUserId);
  const header = await editableHeader({
    template,
    headerType: normalizedHeaderType,
    headerFile,
    token,
  });
  const components = buildTemplateComponents({
    headerType: normalizedHeaderType,
    headerHandle: header.headerHandle,
    bodyText,
    exampleValues: exampleValuesFromMappings(mappings),
  });

  if (!pivot) {
    const { credentials } = await resolveActiveWhatsappMetaByOwner(ownerUserId);
    const name = generateTemplateName(numericSlot);
    template = await WhatsappMessageTemplate.create({
      ownerUserId,
      wabaId: credentials.wabaId,
      metaTemplateId: null,
      name,
      language: TEMPLATE_LANGUAGE,
      category: TEMPLATE_CATEGORY,
      ...localTemplateFields({
        headerType: normalizedHeaderType,
        header,
        components,
        bodyStatus: "DRAFT",
      }),
      isWabaDefault: false,
    });
    pivot = await EventWhatsappTemplate.create({
      eventId,
      whatsappMessageTemplateId: template.id,
      ownerUserId,
      slot: numericSlot,
      isCampaign: false,
      slotMappings: mappings,
    });
    const meta = await createOnMeta({
      wabaId: credentials.wabaId,
      token,
      slot: numericSlot,
      components,
      initialName: name,
    });
    await template.update({
      metaTemplateId: meta.metaTemplateId,
      name: meta.name,
      status: "PENDING",
      rejectedReason: null,
    });
    if (header.headerFile) {
      await persistHeaderFile({ ownerUserId, template, headerFile: header.headerFile });
    }
  } else {
    if (!template.metaTemplateId) {
      const meta = await createOnMeta({
        wabaId: template.wabaId,
        token,
        slot: numericSlot,
        components,
        language: template.language || TEMPLATE_LANGUAGE,
        category: template.category || TEMPLATE_CATEGORY,
        initialName: template.name,
      });
      await template.update({
        ...localTemplateFields({
          headerType: normalizedHeaderType,
          header,
          components,
        }),
        metaTemplateId: meta.metaTemplateId,
        name: meta.name,
      });
      if (header.headerFile) {
        await persistHeaderFile({ ownerUserId, template, headerFile: header.headerFile });
      }
      await pivot.update({ slotMappings: mappings });
    } else if (
      await EventWhatsappTemplate.count({
        where: { whatsappMessageTemplateId: template.id },
      }) === 1 && !template.isWabaDefault
    ) {
      await updateMessageTemplate({
        templateId: template.metaTemplateId,
        token,
        payload: {
          components,
          language: template.language || TEMPLATE_LANGUAGE,
          category: template.category || TEMPLATE_CATEGORY,
        },
      });
      await template.update(localTemplateFields({
        headerType: normalizedHeaderType,
        header,
        components,
      }));
      if (header.headerFile) {
        await persistHeaderFile({ ownerUserId, template, headerFile: header.headerFile });
      }
      await pivot.update({ slotMappings: mappings });
    } else {
      const meta = await createOnMeta({
        wabaId: template.wabaId,
        token,
        slot: numericSlot,
        components,
        language: template.language,
        category: template.category,
      });
      const clone = await WhatsappMessageTemplate.create({
        ownerUserId,
        wabaId: template.wabaId,
        metaTemplateId: meta.metaTemplateId,
        name: meta.name,
        language: template.language || TEMPLATE_LANGUAGE,
        category: template.category || TEMPLATE_CATEGORY,
        ...localTemplateFields({
          headerType: normalizedHeaderType,
          header,
          components,
        }),
        isWabaDefault: false,
        clonedFromId: template.id,
      });
      if (header.headerFile) {
        await persistHeaderFile({ ownerUserId, template: clone, headerFile: header.headerFile });
      }
      await pivot.update({
        whatsappMessageTemplateId: clone.id,
        slotMappings: mappings,
      });
      template = clone;
    }
  }

  if (isCampaign === true) {
    await setCampaignSlot({ eventId, slot: numericSlot });
  }
  return template;
}
