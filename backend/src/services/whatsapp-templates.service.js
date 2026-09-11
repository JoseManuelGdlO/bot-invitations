import fs from "node:fs";
import path from "node:path";
import {
  Event,
  EventWhatsappTemplate,
  WhatsappMessageTemplate,
} from "../models/index.js";
import { httpError } from "../utils/http-error.js";
import {
  createMessageTemplate,
  resolveTemplateCrudToken,
  uploadResumableHeader,
} from "./meta-graph.client.js";
import {
  assertWizardBody,
  buildTemplateComponents,
  defaultSlotMappings,
  exampleValuesFromMappings,
  generateTemplateName,
} from "./whatsapp-template-slots.js";
import { resolveActiveWhatsappMetaByOwner } from "./whatsapp-meta.service.js";

const TEMPLATE_LANGUAGE = "es_MX";
const TEMPLATE_CATEGORY = "MARKETING";
const HEADER_TYPES = new Set(["none", "document", "image"]);

function validateWizardTemplates(templates) {
  if (!Array.isArray(templates) || templates.length < 1 || templates.length > 2) {
    throw httpError(400, "Debes crear una o dos plantillas.");
  }

  const slots = new Set();
  const validated = templates.map((template) => {
    const slot = Number(template?.slot);
    const headerType = String(template?.headerType || "none").toLowerCase();
    if (![1, 2].includes(slot) || slots.has(slot)) {
      throw httpError(400, "Los slots deben ser 1 y/o 2, sin duplicados.");
    }
    if (!HEADER_TYPES.has(headerType)) {
      throw httpError(400, "El tipo de encabezado no es válido.");
    }
    slots.add(slot);

    const body = String(template?.body || "");
    assertWizardBody(body);
    const slotMappings = defaultSlotMappings(body);
    if (Object.values(slotMappings).some((mapping) => mapping == null)) {
      throw httpError(400, "El wizard sólo admite las variables {{1}} y {{2}}.");
    }
    if (headerType !== "none" && !template?.headerFile) {
      throw httpError(400, "La plantilla requiere un archivo de encabezado.");
    }

    return {
      ...template,
      slot,
      headerType,
      body,
      slotMappings,
      isCampaign: Boolean(template?.isCampaign),
    };
  });

  if (validated.length === 1) {
    validated[0].isCampaign = true;
  } else if (!validated.some((template) => template.isCampaign)) {
    throw httpError(400, "Al menos una plantilla debe usarse para campaña.");
  }
  return validated;
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
}) {
  let name = generateTemplateName(slot);
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

export async function createWizardTemplates({
  ownerUserId,
  wabaId,
  plannerAccessToken,
  templates,
}) {
  const validated = validateWizardTemplates(templates);
  const token = resolveTemplateCrudToken(plannerAccessToken);
  const created = [];

  for (const templateInput of validated) {
    const headerFile = templateInput.headerType === "none"
      ? null
      : templateInput.headerFile || null;
    const headerHandle = headerFile
      ? await uploadResumableHeader({
        token,
        fileName: headerFile.fileName,
        fileLength: headerFile.size,
        fileType: headerFile.mime,
        buffer: headerFile.buffer,
      })
      : null;
    const components = buildTemplateComponents({
      headerType: templateInput.headerType,
      headerHandle,
      bodyText: templateInput.body,
      exampleValues: exampleValuesFromMappings(templateInput.slotMappings),
    });
    const meta = await createOnMeta({
      wabaId,
      token,
      slot: templateInput.slot,
      components,
    });
    const row = await WhatsappMessageTemplate.create({
      ownerUserId,
      wabaId,
      metaTemplateId: meta.metaTemplateId,
      name: meta.name,
      language: TEMPLATE_LANGUAGE,
      category: TEMPLATE_CATEGORY,
      headerType: templateInput.headerType,
      headerMediaPath: null,
      headerFileName: headerFile?.fileName || null,
      headerMime: headerFile?.mime || null,
      headerSize: headerFile?.size ?? null,
      headerHandle,
      components,
      status: "PENDING",
      isWabaDefault: true,
    });
    await persistHeaderFile({ ownerUserId, template: row, headerFile });
    created.push({ row, input: templateInput });
  }

  const event = await Event.findOne({
    where: { ownerId: ownerUserId },
    order: [["createdAt", "DESC"]],
  });
  if (event) {
    for (const item of created) {
      await EventWhatsappTemplate.create({
        eventId: event.id,
        whatsappMessageTemplateId: item.row.id,
        ownerUserId,
        slot: item.input.slot,
        isCampaign: item.input.isCampaign,
        slotMappings: item.input.slotMappings,
      });
    }
  }

  return created.map(({ row }) => row);
}

async function sourceTemplatesFor(event) {
  const defaults = await WhatsappMessageTemplate.findAll({
    where: { ownerUserId: event.ownerId, isWabaDefault: true },
    order: [["createdAt", "ASC"]],
  });
  if (defaults.length) {
    const links = await EventWhatsappTemplate.findAll({
      where: {
        whatsappMessageTemplateId: defaults.map((template) => template.id),
      },
      order: [["slot", "ASC"]],
    });
    return { templates: defaults, links };
  }

  const ownerEvents = await Event.findAll({
    where: { ownerId: event.ownerId },
    order: [["createdAt", "ASC"]],
  });
  for (const ownerEvent of ownerEvents) {
    if (ownerEvent.id === event.id) continue;
    const links = await EventWhatsappTemplate.findAll({
      where: { eventId: ownerEvent.id },
      include: [{ model: WhatsappMessageTemplate, as: "template", required: true }],
      order: [["slot", "ASC"]],
    });
    if (links.length) {
      return {
        templates: links.map((link) => link.template).filter(Boolean),
        links,
      };
    }
  }
  return { templates: [], links: [] };
}

function sourceLinkFor(template, links, index) {
  return links.find(
    (link) => link.whatsappMessageTemplateId === template.id,
  ) || links[index] || null;
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
  try {
    return resolveTemplateCrudToken();
  } catch {
    const { credentials } = await resolveActiveWhatsappMetaByOwner(ownerUserId);
    return resolveTemplateCrudToken(credentials.accessToken);
  }
}

export async function ensureEventWhatsappTemplates(event) {
  const existing = await EventWhatsappTemplate.findAll({
    where: { eventId: event.id },
    include: [{ model: WhatsappMessageTemplate, as: "template" }],
    order: [["slot", "ASC"]],
  });
  if (existing.length) {
    return { attached: false, cloned: false, links: existing };
  }

  const source = await sourceTemplatesFor(event);
  if (!source.templates.length) {
    return { attached: false, cloned: false, links: [] };
  }

  if (!source.links.length) {
    const links = [];
    for (const [index, template] of source.templates.entries()) {
      links.push(await EventWhatsappTemplate.create({
        eventId: event.id,
        whatsappMessageTemplateId: template.id,
        ownerUserId: event.ownerId,
        slot: index + 1,
        isCampaign: index === 0,
        slotMappings: {},
      }));
    }
    return { attached: true, cloned: false, links };
  }

  const token = await resolveOwnerTemplateToken(event.ownerId);
  const clones = [];
  for (const [index, origin] of source.templates.entries()) {
    const sourceLink = sourceLinkFor(origin, source.links, index);
    const slot = sourceLink?.slot ?? index + 1;
    const header = await cloneHeader(origin, token);
    const meta = await createOnMeta({
      wabaId: origin.wabaId,
      token,
      slot,
      components: header.components,
      language: origin.language,
      category: origin.category,
    });
    const clone = await WhatsappMessageTemplate.create({
      ownerUserId: event.ownerId,
      wabaId: origin.wabaId,
      metaTemplateId: meta.metaTemplateId,
      name: meta.name,
      language: origin.language,
      category: origin.category,
      headerType: origin.headerType,
      headerMediaPath: null,
      headerFileName: origin.headerFileName || null,
      headerMime: origin.headerMime || null,
      headerSize: origin.headerSize ?? null,
      headerHandle: header.headerHandle,
      components: header.components,
      status: "PENDING",
      isWabaDefault: false,
      clonedFromId: origin.id,
    });
    await persistHeaderFile({
      ownerUserId: event.ownerId,
      template: clone,
      headerFile: header.headerFile,
    });
    clones.push({ clone, sourceLink, slot, index });
  }

  const links = [];
  for (const { clone, sourceLink, slot, index } of clones) {
    links.push(await EventWhatsappTemplate.create({
      eventId: event.id,
      whatsappMessageTemplateId: clone.id,
      ownerUserId: event.ownerId,
      slot,
      isCampaign: sourceLink?.isCampaign ?? index === 0,
      slotMappings: sourceLink?.slotMappings || {},
    }));
  }
  return { attached: false, cloned: true, links };
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
