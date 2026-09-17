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
  normalizeDisplayName,
  resolveSlotParamValues,
} from "./whatsapp-template-slots.js";
import {
  DEFAULT_TEMPLATE_PURPOSE,
  PURPOSE_DEFAULTS,
  missingPurposeTemplateError,
  normalizeTemplatePurpose,
  pendingPurposeTemplateError,
} from "./whatsapp-template-purpose.js";
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
  purpose = DEFAULT_TEMPLATE_PURPOSE,
}) {
  const normalizedPurpose = normalizeTemplatePurpose(purpose);
  let name = initialName || generateTemplateName(slot, normalizedPurpose);
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
      name = generateTemplateName(slot, normalizedPurpose);
    }
  }
  throw new Error("No se pudo crear la plantilla.");
}

function templatePurposeOf(row) {
  return normalizeTemplatePurpose(row?.purpose);
}

function isRejectedStatus(row) {
  return String(row?.status || "").toUpperCase() === "REJECTED";
}

async function findDefaultsForWaba({ ownerUserId, wabaId }) {
  return WhatsappMessageTemplate.findAll({
    where: { ownerUserId, wabaId, isWabaDefault: true },
    order: [["createdAt", "ASC"]],
  });
}

function defaultForPurpose(defaults, purpose) {
  const normalized = normalizeTemplatePurpose(purpose);
  return defaults.find((row) => (
    templatePurposeOf(row) === normalized && !isRejectedStatus(row)
  )) || null;
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

async function findReusableWizardDefault({
  ownerUserId,
  wabaId,
  purpose = DEFAULT_TEMPLATE_PURPOSE,
}) {
  const defaults = await findDefaultsForWaba({ ownerUserId, wabaId });
  const candidates = defaults.filter(
    (row) => templatePurposeOf(row) === normalizeTemplatePurpose(purpose)
      && !isRejectedStatus(row),
  );
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const ranked = await Promise.all(candidates.map(async (row) => ({
    row,
    campaignCount: await EventWhatsappTemplate.count({
      where: { whatsappMessageTemplateId: row.id, isCampaign: true },
    }),
  })));
  ranked.sort((a, b) => b.campaignCount - a.campaignCount);
  return ranked[0].row;
}

function selectedLinkForPurpose(eventLinks, purpose) {
  const normalized = normalizeTemplatePurpose(purpose);
  return eventLinks.find((link) => (
    Boolean(link.isCampaign)
    && templatePurposeOf(link.template) === normalized
  )) || null;
}

export async function attachDefaultToOwnerEvents(
  ownerUserId,
  templateId,
  slotMappings,
  purpose = DEFAULT_TEMPLATE_PURPOSE,
) {
  const events = await Event.findAll({ where: { ownerId: ownerUserId } });
  if (!events.length) return;
  const incoming = await WhatsappMessageTemplate.findByPk(templateId);
  const incomingWaba = String(incoming?.wabaId || "").trim();
  const normalizedPurpose = normalizeTemplatePurpose(purpose || incoming?.purpose);
  const links = await EventWhatsappTemplate.findAll({
    where: { eventId: events.map((event) => event.id) },
    include: [{ model: WhatsappMessageTemplate, as: "template" }],
  });
  const linksByEvent = new Map();
  for (const link of links) {
    const list = linksByEvent.get(link.eventId) || [];
    list.push(link);
    linksByEvent.set(link.eventId, list);
  }
  for (const event of events) {
    const eventLinks = linksByEvent.get(event.id) || [];
    const selected = selectedLinkForPurpose(eventLinks, normalizedPurpose);
    if (selected) {
      const selectedWaba = String(selected.template?.wabaId || "").trim();
      if (incomingWaba && selectedWaba && selectedWaba !== incomingWaba) {
        await selected.update({
          whatsappMessageTemplateId: templateId,
          slotMappings,
        });
      }
      continue;
    }
    const alreadyLinked = eventLinks.find(
      (link) => link.whatsappMessageTemplateId === templateId,
    );
    if (alreadyLinked) {
      await alreadyLinked.update({ isCampaign: true, slotMappings });
      continue;
    }
    const slot = nextEventSlot(eventLinks);
    const created = await EventWhatsappTemplate.create({
      eventId: event.id,
      whatsappMessageTemplateId: templateId,
      ownerUserId,
      slot,
      isCampaign: true,
      slotMappings,
    });
    eventLinks.push(created);
  }
}

async function attachAndSyncWizardDefault(
  ownerUserId,
  templateId,
  slotMappings,
  purpose = DEFAULT_TEMPLATE_PURPOSE,
) {
  await attachDefaultToOwnerEvents(ownerUserId, templateId, slotMappings, purpose);
  await EventWhatsappTemplate.update(
    { slotMappings },
    { where: { whatsappMessageTemplateId: templateId } },
  );
}

async function createPurposeDefault({
  ownerUserId,
  wabaId,
  token,
  purpose,
}) {
  const spec = PURPOSE_DEFAULTS[purpose];
  if (!spec) return null;
  const mappings = assertSlotMappingsComplete(
    spec.body,
    mergeSlotMappings(spec.body, spec.slotMappings),
  );
  const components = buildTemplateComponents({
    headerType: "none",
    headerHandle: null,
    bodyText: spec.body,
    exampleValues: exampleValuesFromMappings(mappings),
  });
  const meta = await createOnMeta({
    wabaId,
    token,
    slot: 1,
    components,
    purpose,
  });
  const row = await WhatsappMessageTemplate.create({
    ownerUserId,
    wabaId,
    metaTemplateId: meta.metaTemplateId,
    name: meta.name,
    language: TEMPLATE_LANGUAGE,
    category: TEMPLATE_CATEGORY,
    headerType: "none",
    headerMediaPath: null,
    headerFileName: null,
    headerMime: null,
    headerSize: null,
    headerHandle: null,
    components,
    status: "PENDING",
    isWabaDefault: true,
    purpose,
    displayName: spec.displayName,
  });
  await attachAndSyncWizardDefault(ownerUserId, row.id, mappings, purpose);
  return row;
}

export async function ensurePurposeDefaults({ ownerUserId, wabaId, token }) {
  const defaults = await findDefaultsForWaba({ ownerUserId, wabaId });
  const created = [];
  for (const purpose of Object.keys(PURPOSE_DEFAULTS)) {
    const spec = PURPOSE_DEFAULTS[purpose];
    const existing = defaultForPurpose(defaults, purpose);
    if (existing) {
      const bodyText = bodyTextFromComponents(existing.components) || spec.body;
      const mappings = assertSlotMappingsComplete(
        bodyText,
        mergeSlotMappings(bodyText, {
          ...spec.slotMappings,
          ...(await originSlotMappings(existing)),
        }),
      );
      await attachDefaultToOwnerEvents(ownerUserId, existing.id, mappings, purpose);
      continue;
    }
    const row = await createPurposeDefault({ ownerUserId, wabaId, token, purpose });
    if (row) {
      created.push(row);
      defaults.push(row);
    }
  }
  return created;
}

async function finishWizardTemplates(ownerUserId, wabaId, token, template, slotMappings) {
  await attachAndSyncWizardDefault(
    ownerUserId,
    template.id,
    slotMappings,
    DEFAULT_TEMPLATE_PURPOSE,
  );
  await ensurePurposeDefaults({ ownerUserId, wabaId, token });
  return { template, slotMappings };
}

export async function createWizardTemplates(input) {
  const normalized = normalizeWizardInput(input);
  const validated = validateWizardTemplate(normalized);
  const { ownerUserId, wabaId, plannerAccessToken } = normalized;
  const token = resolveTemplateCrudToken(plannerAccessToken);
  const existing = await findReusableWizardDefault({
    ownerUserId,
    wabaId,
    purpose: DEFAULT_TEMPLATE_PURPOSE,
  });
  const displayNamePatch = normalized.displayName !== undefined
    ? { displayName: normalizeDisplayName(normalized.displayName) }
    : {};

  if (existing && wizardContentUnchanged(existing, validated)) {
    if (
      displayNamePatch.displayName !== undefined
      && existing.displayName !== displayNamePatch.displayName
    ) {
      await existing.update(displayNamePatch);
    }
    return finishWizardTemplates(
      ownerUserId,
      wabaId,
      token,
      existing,
      validated.slotMappings,
    );
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
    await existing.update({
      ...localTemplateFields({
        headerType: validated.headerType,
        header,
        components,
      }),
      purpose: DEFAULT_TEMPLATE_PURPOSE,
      ...displayNamePatch,
    });
    if (header.headerFile) {
      await persistHeaderFile({
        ownerUserId,
        template: existing,
        headerFile: header.headerFile,
      });
    }
    return finishWizardTemplates(
      ownerUserId,
      wabaId,
      token,
      existing,
      validated.slotMappings,
    );
  }

  const meta = await createOnMeta({
    wabaId,
    token,
    slot: 1,
    components,
    purpose: DEFAULT_TEMPLATE_PURPOSE,
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
    purpose: DEFAULT_TEMPLATE_PURPOSE,
    displayName: normalizeDisplayName(normalized.displayName),
  });
  if (header.headerFile) {
    await persistHeaderFile({ ownerUserId, template: row, headerFile: header.headerFile });
  }
  return finishWizardTemplates(
    ownerUserId,
    wabaId,
    token,
    row,
    validated.slotMappings,
  );
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

async function promoteCurrentWabaDefault({
  ownerUserId,
  wabaId,
  purpose = DEFAULT_TEMPLATE_PURPOSE,
}) {
  const normalized = normalizeTemplatePurpose(purpose);
  const hsms = await WhatsappMessageTemplate.findAll({
    where: { ownerUserId, wabaId },
    order: [["createdAt", "ASC"]],
  });
  const matching = hsms.filter((row) => templatePurposeOf(row) === normalized);
  const pick = matching.find((row) => isTemplateStatus(row, "APPROVED"))
    || matching.find((row) => isTemplateStatus(row, "PENDING"))
    || null;
  if (!pick) return null;
  await pick.update({ isWabaDefault: true, purpose: normalized });
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

function slotMappingsByTemplateId(links = []) {
  const mappings = new Map();
  for (const link of links) {
    const templateId = link.whatsappMessageTemplateId;
    if (!templateId || mappings.has(templateId)) continue;
    mappings.set(templateId, link.slotMappings || {});
  }
  return mappings;
}

export async function listOwnerTemplates(ownerUserId) {
  const { credentials } = await resolveActiveWhatsappMetaByOwner(ownerUserId);
  const wabaId = String(credentials?.wabaId || "").trim();
  if (!wabaId) throw httpError(400, "WhatsApp (Meta) no está configurado.");
  const token = resolveTemplateCrudToken(credentials.accessToken);

  const defaults = await WhatsappMessageTemplate.findAll({
    where: { ownerUserId, wabaId, isWabaDefault: true },
  });
  if (!defaults.length) {
    await promoteCurrentWabaDefault({
      ownerUserId,
      wabaId,
      purpose: DEFAULT_TEMPLATE_PURPOSE,
    });
  }
  await ensurePurposeDefaults({ ownerUserId, wabaId, token });

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
  const slotMappings = slotMappingsByTemplateId(links);
  return templates.map((row) => Object.assign(row, {
    usage: serializeUsage(usage.get(row.id)),
    slotMappings: slotMappings.get(row.id) || {},
    purpose: templatePurposeOf(row),
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
  const purpose = templatePurposeOf(template);
  let defaults = await WhatsappMessageTemplate.findAll({
    where: { ownerUserId, wabaId, isWabaDefault: true },
  });
  defaults = defaults.filter((row) => templatePurposeOf(row) === purpose);
  if (!defaults.length) {
    const promoted = await promoteCurrentWabaDefault({ ownerUserId, wabaId, purpose });
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
    if (templatePurposeOf(link.template) !== purpose) continue;
    if (isCampaignCapableStatus(link.template)) covered.add(link.eventId);
  }
  if (events.some((event) => !covered.has(event.id))) {
    throw httpError(
      409,
      "No se puede dejar eventos sin plantilla de primer contacto; primero crea otra o asígnala",
    );
  }
}

async function reattachDefaultAfterCustomDelete(ownerUserId, wabaId, purpose) {
  const accountDefault = await findReusableWizardDefault({
    ownerUserId,
    wabaId,
    purpose,
  });
  if (!accountDefault || !isCampaignCapableStatus(accountDefault)) return;

  const existingLink = await EventWhatsappTemplate.findOne({
    where: { whatsappMessageTemplateId: accountDefault.id },
  });
  const slotMappings = existingLink?.slotMappings
    || mergeSlotMappings(bodyTextFromComponents(accountDefault.components), {});
  await attachDefaultToOwnerEvents(
    ownerUserId,
    accountDefault.id,
    slotMappings,
    purpose,
  );
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

  try {
    await EventWhatsappTemplate.destroy({
      where: { whatsappMessageTemplateId: template.id },
    });
    await template.destroy();
  } catch (error) {
    log.error("Graph ya borró la plantilla; falló el destroy local", {
      templateId: template.id,
      metaTemplateId: template.metaTemplateId,
      name: template.name,
      wabaId,
      message: error?.message,
    });
    throw error;
  }

  if (!template.isWabaDefault) {
    await reattachDefaultAfterCustomDelete(
      ownerUserId,
      wabaId,
      templatePurposeOf(template),
    );
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

async function retargetStaleCampaignLinks({ existing, source }) {
  const preferredByPurpose = new Map();
  for (const template of source.templates) {
    const purpose = templatePurposeOf(template);
    if (!preferredByPurpose.has(purpose)) preferredByPurpose.set(purpose, template);
  }
  let retargeted = false;
  for (const link of existing) {
    if (!link.isCampaign) continue;
    const purpose = templatePurposeOf(link.template);
    const preferred = preferredByPurpose.get(purpose);
    if (!preferred) continue;
    const currentWabaId = String(preferred.wabaId || "").trim();
    const linkedWaba = String(link.template?.wabaId || "").trim();
    if (!currentWabaId || !linkedWaba || linkedWaba === currentWabaId) continue;
    const preferredLink = sourceLinkFor(preferred, source.links);
    const slotMappings = preferredLink?.slotMappings || link.slotMappings;
    await link.update({
      whatsappMessageTemplateId: preferred.id,
      slotMappings,
    });
    link.whatsappMessageTemplateId = preferred.id;
    link.template = preferred;
    link.slotMappings = slotMappings;
    retargeted = true;
  }
  return retargeted;
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

  const retargeted = await retargetStaleCampaignLinks({ existing, source });
  const linkedIds = new Set(existing.map((link) => link.whatsappMessageTemplateId));
  const selectedPurposes = new Set(
    existing
      .filter((link) => link.isCampaign)
      .map((link) => templatePurposeOf(link.template)),
  );
  const missing = source.templates.filter((template) => !linkedIds.has(template.id));
  if (!missing.length) {
    return { attached: retargeted, cloned: false, links: existing };
  }

  const links = [...existing];
  for (const origin of missing) {
    const sourceLink = sourceLinkFor(origin, source.links);
    const purpose = templatePurposeOf(origin);
    const slot = nextEventSlot(links);
    const created = await EventWhatsappTemplate.create({
      eventId: event.id,
      whatsappMessageTemplateId: origin.id,
      ownerUserId: event.ownerId,
      slot,
      isCampaign: !selectedPurposes.has(purpose),
      slotMappings: sourceLink?.slotMappings || {},
    });
    if (!selectedPurposes.has(purpose)) selectedPurposes.add(purpose);
    links.push(created);
  }
  return { attached: true, cloned: false, links };
}

function missingCampaignTemplateError(purpose = DEFAULT_TEMPLATE_PURPOSE) {
  return httpError(400, missingPurposeTemplateError(purpose));
}

function assertLinkedTemplateReady(link, purpose = DEFAULT_TEMPLATE_PURPOSE) {
  if (!link?.template) throw missingCampaignTemplateError(purpose);
  if (link.template.status !== "APPROVED") {
    throw httpError(400, pendingPurposeTemplateError(purpose));
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

async function findSelectedLink(eventId, purpose = DEFAULT_TEMPLATE_PURPOSE) {
  const normalized = normalizeTemplatePurpose(purpose);
  const links = await EventWhatsappTemplate.findAll({
    where: { eventId, isCampaign: true },
    include: [{ model: WhatsappMessageTemplate, as: "template", required: true }],
  });
  return links.find((link) => templatePurposeOf(link.template) === normalized) || null;
}

export async function assertPurposeTemplateReady(event, purpose = DEFAULT_TEMPLATE_PURPOSE) {
  const normalized = normalizeTemplatePurpose(purpose);
  await ensureEventWhatsappTemplates(event);
  const link = await findSelectedLink(event.id, normalized);
  if (!link) throw missingCampaignTemplateError(normalized);
  return assertLinkedTemplateReady(link, normalized);
}

export async function assertCampaignTemplateReady(event) {
  return assertPurposeTemplateReady(event, DEFAULT_TEMPLATE_PURPOSE);
}

export async function resolvePurposeSendContext(event, purpose = DEFAULT_TEMPLATE_PURPOSE) {
  const link = await assertPurposeTemplateReady(event, purpose);
  return sendContextFrom(link, event);
}

export async function resolveCampaignSendContext(event) {
  return resolvePurposeSendContext(event, DEFAULT_TEMPLATE_PURPOSE);
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
        where: { wabaId: currentWabaId, purpose: DEFAULT_TEMPLATE_PURPOSE },
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
  const numericSlot = assertValidEventSlot(slot);
  const target = await EventWhatsappTemplate.findOne({
    where: { eventId, slot: numericSlot },
    include: [{ model: WhatsappMessageTemplate, as: "template", required: true }],
  });
  if (!target) throw httpError(404, "Plantilla del evento no encontrada.");
  const purpose = templatePurposeOf(target.template);
  const links = await EventWhatsappTemplate.findAll({
    where: { eventId },
    include: [{ model: WhatsappMessageTemplate, as: "template", required: true }],
  });
  const samePurposeIds = links
    .filter((link) => templatePurposeOf(link.template) === purpose)
    .map((link) => link.id)
    .filter(Boolean);
  if (samePurposeIds.length) {
    await EventWhatsappTemplate.update(
      { isCampaign: false },
      { where: { id: samePurposeIds } },
    );
  }
  await target.update({ isCampaign: true });
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

function persistableDisplayName(payloadName, fallbackName) {
  if (payloadName !== undefined) return normalizeDisplayName(payloadName);
  return normalizeDisplayName(fallbackName);
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

async function loadEventTemplateLinks(eventId, purpose) {
  const links = await EventWhatsappTemplate.findAll({
    where: { eventId },
    include: [{ model: WhatsappMessageTemplate, as: "template" }],
  });
  const normalized = normalizeTemplatePurpose(purpose);
  const samePurposeCount = links.filter(
    (link) => templatePurposeOf(link.template) === normalized,
  ).length;
  if (samePurposeCount >= EVENT_TEMPLATE_CAP) {
    throw httpError(400, "El evento ya tiene el máximo de 10 plantillas.");
  }
  return links;
}

async function resolveCustomOrigin({ source, templateId, ownerUserId, wabaId, purpose }) {
  const normalized = String(source || "").trim().toLowerCase();
  if (normalized === "blank") return null;
  if (normalized === "default") {
    const origin = await findReusableWizardDefault({
      ownerUserId,
      wabaId,
      purpose,
    });
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
  displayName,
  body,
  headerType,
  headerFile,
  slotMappings,
  purpose,
}) {
  await requireOwnedEvent(eventId, ownerUserId);
  const { credentials } = await resolveActiveWhatsappMetaByOwner(ownerUserId);
  const wabaId = String(credentials?.wabaId || "").trim();
  if (!wabaId) throw httpError(400, "WhatsApp (Meta) no está configurado.");
  const token = resolveTemplateCrudToken(credentials.accessToken);
  const requestedPurpose = normalizeTemplatePurpose(purpose);

  const links = await loadEventTemplateLinks(eventId, requestedPurpose);
  const origin = await resolveCustomOrigin({
    source,
    templateId,
    ownerUserId,
    wabaId,
    purpose: requestedPurpose,
  });
  const purposeToSave = origin ? templatePurposeOf(origin) : requestedPurpose;

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
    purpose: purposeToSave,
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
    purpose: purposeToSave,
    clonedFromId: origin?.id || null,
    displayName: persistableDisplayName(displayName, origin?.displayName),
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

  const links = await loadEventTemplateLinks(eventId, templatePurposeOf(template));
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
  displayName,
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
  const { credentials } = await resolveActiveWhatsappMetaByOwner(ownerUserId);
  const wabaId = String(credentials?.wabaId || "").trim();
  if (!wabaId) throw httpError(400, "WhatsApp (Meta) no está configurado.");
  const token = resolveTemplateCrudToken(credentials.accessToken);
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
    const name = generateTemplateName(numericSlot, templatePurposeOf(template) || DEFAULT_TEMPLATE_PURPOSE);
    template = await WhatsappMessageTemplate.create({
      ownerUserId,
      wabaId,
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
      purpose: DEFAULT_TEMPLATE_PURPOSE,
      displayName: persistableDisplayName(displayName, null),
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
      wabaId,
      token,
      slot: numericSlot,
      components,
      initialName: name,
      purpose: DEFAULT_TEMPLATE_PURPOSE,
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
        wabaId,
        token,
        slot: numericSlot,
        components,
        language: template.language || TEMPLATE_LANGUAGE,
        category: template.category || TEMPLATE_CATEGORY,
        initialName: template.name,
        purpose: templatePurposeOf(template),
      });
    await template.update({
      ...localTemplateFields({
        headerType: normalizedHeaderType,
        header,
        components,
      }),
      metaTemplateId: meta.metaTemplateId,
      name: meta.name,
      wabaId,
      displayName: persistableDisplayName(displayName, template.displayName),
    });
    if (header.headerFile) {
      await persistHeaderFile({ ownerUserId, template, headerFile: header.headerFile });
    }
    await pivot.update({ slotMappings: mappings });
  } else if (
      await EventWhatsappTemplate.count({
        where: { whatsappMessageTemplateId: template.id },
      }) === 1 && !template.isWabaDefault
      && String(template.wabaId || "").trim() === wabaId
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
      await template.update({
        ...localTemplateFields({
          headerType: normalizedHeaderType,
          header,
          components,
        }),
        displayName: persistableDisplayName(displayName, template.displayName),
      });
      if (header.headerFile) {
        await persistHeaderFile({ ownerUserId, template, headerFile: header.headerFile });
      }
      await pivot.update({ slotMappings: mappings });
    } else {
      const meta = await createOnMeta({
        wabaId,
        token,
        slot: numericSlot,
        components,
        language: template.language,
        category: template.category,
        purpose: templatePurposeOf(template),
      });
      const clone = await WhatsappMessageTemplate.create({
        ownerUserId,
        wabaId,
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
        purpose: templatePurposeOf(template),
        clonedFromId: template.id,
        displayName: persistableDisplayName(displayName, template.displayName),
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

export async function submitOwnerCustomTemplate({
  ownerUserId,
  templateId,
  body,
  headerType,
  headerFile,
  slotMappings,
  displayName,
}) {
  const { credentials } = await resolveActiveWhatsappMetaByOwner(ownerUserId);
  const wabaId = String(credentials?.wabaId || "").trim();
  if (!wabaId) throw httpError(400, "WhatsApp (Meta) no está configurado.");

  const id = String(templateId || "").trim();
  const template = await WhatsappMessageTemplate.findOne({
    where: { id, ownerUserId, wabaId },
  });
  if (!template) throw httpError(404, "Plantilla no encontrada.");
  if (template.isWabaDefault && templatePurposeOf(template) === DEFAULT_TEMPLATE_PURPOSE) {
    throw httpError(400, "Edita la plantilla default con el wizard.");
  }

  const normalizedHeaderType = String(headerType || "none").toLowerCase();
  if (!HEADER_TYPES.has(normalizedHeaderType)) {
    throw httpError(400, "El tipo de encabezado no es válido.");
  }

  const bodyText = String(body || "");
  assertWizardBody(bodyText);
  const mappings = assertSlotMappingsComplete(
    bodyText,
    mergeSlotMappings(bodyText, slotMappings || {}),
  );
  const token = resolveTemplateCrudToken(credentials.accessToken);
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

  if (!template.metaTemplateId) {
    const meta = await createOnMeta({
      wabaId,
      token,
      slot: 1,
      components,
      language: template.language || TEMPLATE_LANGUAGE,
      category: template.category || TEMPLATE_CATEGORY,
      initialName: template.name,
      purpose: templatePurposeOf(template),
    });
    await template.update({
      ...localTemplateFields({
        headerType: normalizedHeaderType,
        header,
        components,
      }),
      metaTemplateId: meta.metaTemplateId,
      name: meta.name,
      wabaId,
      displayName: persistableDisplayName(displayName, template.displayName),
    });
  } else {
    await updateMessageTemplate({
      templateId: template.metaTemplateId,
      token,
      payload: {
        components,
        language: template.language || TEMPLATE_LANGUAGE,
        category: template.category || TEMPLATE_CATEGORY,
      },
    });
    await template.update({
      ...localTemplateFields({
        headerType: normalizedHeaderType,
        header,
        components,
      }),
      displayName: persistableDisplayName(displayName, template.displayName),
    });
  }

  if (header.headerFile) {
    await persistHeaderFile({ ownerUserId, template, headerFile: header.headerFile });
  }

  const links = await EventWhatsappTemplate.findAll({
    where: { whatsappMessageTemplateId: template.id },
    include: [{ model: Event }],
  });
  for (const link of links) {
    await link.update({ slotMappings: mappings });
  }

  return Object.assign(template, {
    slotMappings: mappings,
    usage: serializeUsage(usageByTemplateId(links).get(template.id)),
  });
}
