import crypto from "node:crypto";
import { httpError } from "../utils/http-error.js";

export const LOCKED_SLOT_MAPPINGS = {
  "1": { type: "field", key: "nombre" },
  "2": { type: "field", key: "numero_invitados" },
};

const PLACEHOLDER_REGEX = /\{\{(\d+)\}\}/g;
const FIELD_KEY_REGEX = /^\w+$/;

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

export function assertWizardBody(bodyText) {
  const ids = extractBodyPlaceholders(bodyText);
  const hasCanonicalSequence =
    ids.length >= 2 && ids.every((id, index) => id === String(index + 1));
  if (!hasCanonicalSequence) {
    throw httpError(400, "La plantilla debe incluir {{1}} (nombre) y {{2}} (pases) consecutivos.");
  }
  return ids;
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

export function resolveSlotParamValues(mappings, vars) {
  const ids = Object.keys(mappings).sort((a, b) => Number(a) - Number(b));
  return ids.map((id) => {
    const mapping = mappings[id];
    if (mapping.type === "literal") return String(mapping.value ?? "");
    if (mapping.type === "field") return String(vars?.[mapping.key] ?? "");
    return "";
  });
}
