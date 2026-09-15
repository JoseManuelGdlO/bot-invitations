import crypto from "node:crypto";
import { httpError } from "../utils/http-error.js";

export const LOCKED_SLOT_MAPPINGS = {
  "1": { type: "field", key: "nombre" },
  "2": { type: "field", key: "numero_invitados" },
};

const PLACEHOLDER_REGEX = /\{\{(\d+)\}\}/g;
const FIELD_KEY_REGEX = /^\w+$/;
const STARTS_WITH_PLACEHOLDER = /^\{\{\d+\}\}/;
const ENDS_WITH_PLACEHOLDER = /\{\{\d+\}\}$/;
const ADJACENT_PLACEHOLDERS = /\{\{\d+\}\}\s*\{\{\d+\}\}/;
const CANONICAL_PLACEHOLDER_ID = /^[1-9]\d*$/;
const META_BODY_MAX_LENGTH = 1024;
const META_MIN_WORDS_PER_VAR = 2;
const META_BODY_ERROR_EMPTY = "El cuerpo no puede estar vacío.";
const META_BODY_ERROR_START = "Las variables no pueden ir al principio del mensaje.";
const META_BODY_ERROR_END = "Las variables no pueden ir al final del mensaje.";
const META_BODY_ERROR_ADJACENT =
  "No pongas dos variables seguidas. Separa {{1}} y {{2}} con texto.";
const META_BODY_ERROR_DENSITY =
  "Esta plantilla tiene demasiadas variables en relación con su longitud. Reduce el número de variables o aumenta la longitud del mensaje.";
const META_BODY_ERROR_SEQUENCE =
  "Usa {{1}}, {{2}}, {{3}}… en orden, sin saltos. {{1}} es el nombre y {{2}} el número de pases.";
const META_BODY_ERROR_LENGTH = "El cuerpo no puede superar 1024 caracteres.";

export function extractBodyPlaceholders(bodyText) {
  const ids = [];
  const seen = new Set();
  let match;
  const regex = new RegExp(PLACEHOLDER_REGEX.source, "g");
  while ((match = regex.exec(String(bodyText || ""))) !== null) {
    const id = match[1];
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids.sort((a, b) => Number(a) - Number(b));
}

function metaTemplateBodyErrors(bodyText) {
  const body = String(bodyText || "");
  const trimmed = body.trim();
  const errors = [];

  if (!trimmed) {
    errors.push(META_BODY_ERROR_EMPTY);
    if (body.length > META_BODY_MAX_LENGTH) {
      errors.push(META_BODY_ERROR_LENGTH);
    }
    return errors;
  }

  if (STARTS_WITH_PLACEHOLDER.test(trimmed)) {
    errors.push(META_BODY_ERROR_START);
  }
  if (ENDS_WITH_PLACEHOLDER.test(trimmed)) {
    errors.push(META_BODY_ERROR_END);
  }
  if (ADJACENT_PLACEHOLDERS.test(body)) {
    errors.push(META_BODY_ERROR_ADJACENT);
  }

  const ids = [];
  const regex = new RegExp(PLACEHOLDER_REGEX.source, "g");
  let match;
  while ((match = regex.exec(body)) !== null) {
    ids.push(match[1]);
  }
  const uniqueSorted = [...new Set(ids)].sort((a, b) => Number(a) - Number(b));
  const sequenceInvalid =
    ids.some((id) => !CANONICAL_PLACEHOLDER_ID.test(id)) ||
    uniqueSorted.length !== ids.length ||
    uniqueSorted.length < 2 ||
    uniqueSorted.some((id, index) => id !== String(index + 1));
  if (sequenceInvalid) {
    errors.push(META_BODY_ERROR_SEQUENCE);
  }

  const collapsed = body
    .replace(new RegExp(PLACEHOLDER_REGEX.source, "g"), "")
    .replace(/\s+/g, " ")
    .trim();
  const palabras = collapsed.match(/\S+/g) || [];
  const variables = uniqueSorted.length;
  if (variables > 0 && palabras.length < variables * META_MIN_WORDS_PER_VAR) {
    errors.push(META_BODY_ERROR_DENSITY);
  }

  if (body.length > META_BODY_MAX_LENGTH) {
    errors.push(META_BODY_ERROR_LENGTH);
  }

  return errors;
}

export function assertMetaTemplateBody(bodyText) {
  const errors = metaTemplateBodyErrors(bodyText);
  if (errors.length > 0) {
    throw httpError(400, errors[0]);
  }
  return extractBodyPlaceholders(bodyText);
}

export function assertWizardBody(bodyText) {
  return assertMetaTemplateBody(bodyText);
}

function isSameMapping(a, b) {
  return a?.type === b?.type && a?.key === b?.key && a?.value === b?.value;
}

function validateMapping(mapping) {
  if (!mapping || typeof mapping !== "object") return null;
  if (
    mapping.type === "literal" &&
    mapping.value != null &&
    String(mapping.value).trim().length > 0
  ) {
    return { type: "literal", value: mapping.value };
  }
  if (mapping.type === "field" && FIELD_KEY_REGEX.test(String(mapping.key || ""))) {
    return { type: "field", key: mapping.key };
  }
  return null;
}

export function defaultSlotMappings(bodyText) {
  const placeholders = extractBodyPlaceholders(bodyText);
  const mappings = {};
  for (const id of placeholders) {
    if (id === "1") {
      mappings["1"] = LOCKED_SLOT_MAPPINGS["1"];
    } else if (id === "2") {
      mappings["2"] = LOCKED_SLOT_MAPPINGS["2"];
    } else {
      mappings[id] = null;
    }
  }
  return mappings;
}

export function mergeSlotMappings(bodyText, incoming = {}) {
  const mappings = defaultSlotMappings(bodyText);
  const placeholders = extractBodyPlaceholders(bodyText);

  if (
    Object.prototype.hasOwnProperty.call(incoming, "1") &&
    !isSameMapping(incoming["1"], LOCKED_SLOT_MAPPINGS["1"])
  ) {
    throw httpError(400, "{{1}} y {{2}} no se pueden remapear.");
  }
  if (
    Object.prototype.hasOwnProperty.call(incoming, "2") &&
    !isSameMapping(incoming["2"], LOCKED_SLOT_MAPPINGS["2"])
  ) {
    throw httpError(400, "{{1}} y {{2}} no se pueden remapear.");
  }

  for (const id of placeholders) {
    if (id === "1" || id === "2") continue;
    if (Object.prototype.hasOwnProperty.call(incoming, id)) {
      mappings[id] = validateMapping(incoming[id]);
    }
  }
  return mappings;
}

export function assertSlotMappingsComplete(bodyText, mappings) {
  const placeholders = extractBodyPlaceholders(bodyText);
  for (const id of placeholders) {
    const mapping = validateMapping(mappings?.[id]);
    if (mapping == null) {
      throw httpError(400, `Falta el mapeo de {{${id}}}.`);
    }
  }
  return mappings;
}

export function exampleValuesFromMappings(mappings) {
  const ids = Object.keys(mappings).sort((a, b) => Number(a) - Number(b));
  return ids.map((id) => {
    const mapping = mappings[id];
    if (id === "1") return "María";
    if (id === "2") return "2";
    if (mapping.type === "literal") return String(mapping.value ?? "");
    if (Object.prototype.hasOwnProperty.call(mapping, "value")) return String(mapping.value);
    return String(mapping.key ?? "");
  });
}

export function generateTemplateName(slot) {
  const hex = crypto.randomBytes(4).toString("hex");
  return `alanna_pc_${hex}_${slot}`;
}

export function buildTemplateComponents({ headerType, headerHandle, bodyText, exampleValues }) {
  const components = [];
  if (headerType === "document") {
    if (!headerHandle) {
      throw httpError(400, "La plantilla requiere un archivo de encabezado.");
    }
    components.push({
      type: "HEADER",
      format: "DOCUMENT",
      example: { header_handle: [headerHandle] },
    });
  } else if (headerType === "image") {
    if (!headerHandle) {
      throw httpError(400, "La plantilla requiere un archivo de encabezado.");
    }
    components.push({
      type: "HEADER",
      format: "IMAGE",
      example: { header_handle: [headerHandle] },
    });
  }
  components.push({
    type: "BODY",
    text: bodyText,
    example: { body_text: [exampleValues] },
  });
  return components;
}

export function bodyTextFromComponents(components) {
  const body = (components || []).find((c) => String(c?.type || "").toUpperCase() === "BODY");
  return body?.text ?? "";
}

const DISPLAY_NAME_MAX = 120;
const DISPLAY_NAME_PREVIEW_MAX = 80;

export function normalizeDisplayName(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, DISPLAY_NAME_MAX);
}

export function displayNameOrPreview(template) {
  const named = normalizeDisplayName(template?.displayName);
  if (named) return named;
  const rawBody = typeof template?.body === "string" ? template.body : "";
  const body = rawBody || bodyTextFromComponents(template?.components);
  const preview = String(body || "")
    .replace(/\{\{\d+\}\}/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  if (!preview) return null;
  return preview.slice(0, DISPLAY_NAME_PREVIEW_MAX);
}

export function resolveSlotParamValues(mappings, vars) {
  const ids = Object.keys(mappings).sort((a, b) => Number(a) - Number(b));
  return ids.map((id) => {
    const mapping = mappings[id];
    if (mapping.type === "literal") return String(mapping.value ?? "");
    if (mapping.type === "field") return String(vars?.[mapping.key] ?? "");
    return "";
  });
}
