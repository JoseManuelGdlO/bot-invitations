import { LOCKED_SLOT_MAPPINGS } from "./whatsapp-template-slots.js";

export const TEMPLATE_PURPOSES = ["invitation", "reminder", "followup"];
export const DEFAULT_TEMPLATE_PURPOSE = "invitation";

export const PURPOSE_NAME_PREFIX = {
  invitation: "pc",
  reminder: "rm",
  followup: "sg",
};

export const PURPOSE_DEFAULTS = {
  reminder: {
    displayName: "Recordatorio amable",
    body: "Hola {{1}}, ¿pudiste revisar la invitación? Reservamos {{2}} pases a tu nombre. Nos encantaría contar contigo el {{3}}, por favor.",
    slotMappings: {
      "1": LOCKED_SLOT_MAPPINGS["1"],
      "2": LOCKED_SLOT_MAPPINGS["2"],
      "3": { type: "field", key: "fecha" },
    },
  },
  followup: {
    displayName: "Recontacto a indecisos",
    body: "Hola {{1}}, te escribo de nuevo por {{3}} del {{4}}. Reservamos {{2}} pases a tu nombre. ¿Ya pudieron confirmar si nos acompañan?",
    slotMappings: {
      "1": LOCKED_SLOT_MAPPINGS["1"],
      "2": LOCKED_SLOT_MAPPINGS["2"],
      "3": { type: "field", key: "evento" },
      "4": { type: "field", key: "fecha" },
    },
  },
};

export function normalizeTemplatePurpose(value) {
  const purpose = String(value || "").trim().toLowerCase();
  return TEMPLATE_PURPOSES.includes(purpose) ? purpose : DEFAULT_TEMPLATE_PURPOSE;
}

export function purposeNamePrefix(purpose) {
  return PURPOSE_NAME_PREFIX[normalizeTemplatePurpose(purpose)] || PURPOSE_NAME_PREFIX.invitation;
}

export function missingPurposeTemplateError(purpose) {
  const normalized = normalizeTemplatePurpose(purpose);
  if (normalized === "reminder") {
    return "Crea una plantilla de recordatorio y espera la aprobación de Meta.";
  }
  if (normalized === "followup") {
    return "Crea una plantilla de seguimiento y espera la aprobación de Meta.";
  }
  return "Crea una plantilla de primer contacto y espera la aprobación de Meta.";
}

export function pendingPurposeTemplateError(purpose) {
  const normalized = normalizeTemplatePurpose(purpose);
  if (normalized === "reminder") {
    return "Meta aún no aprueba la plantilla de recordatorio.";
  }
  if (normalized === "followup") {
    return "Meta aún no aprueba la plantilla de seguimiento.";
  }
  return "Meta aún no aprueba la plantilla de campaña.";
}
