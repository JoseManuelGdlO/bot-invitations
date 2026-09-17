import {
  DEFAULT_TEMPLATE_PURPOSE,
  normalizeTemplatePurpose,
  type WhatsappTemplatePurpose,
} from "./whatsapp-template-purpose.ts";

export const ACCOUNT_TEMPLATES_EMPTY_NEEDS_SETUP =
  "Primero debes configurar tu cuenta de WhatsApp. Sin ella no puedes crear ni enviar plantillas.";
export const ACCOUNT_TEMPLATES_EMPTY_NONE = "Aún no hay plantillas";
export const ACCOUNT_TEMPLATES_EMPTY_PURPOSE =
  "Se crean al completar el wizard de invitación.";

export const LAST_WABA_DEFAULT_DELETE_HINT =
  "No se puede borrar la única plantilla default de esta categoría.";

export const ACCOUNT_TEMPLATE_DELETE_META_COPY =
  "Se borra también en Meta y no se puede deshacer.";

export type AccountTemplateLike = {
  id: string | null;
  isWabaDefault: boolean;
  purpose?: string | null;
};

export type AccountTemplateUsage = {
  eventCount: number;
  campaignEventCount: number;
  events: Array<{ id: string; name: string }>;
};

export function isSoleWabaDefault(
  template: AccountTemplateLike,
  templates: AccountTemplateLike[],
): boolean {
  if (!template.isWabaDefault) return false;
  const purpose = normalizeTemplatePurpose(template.purpose);
  const defaults = templates.filter(
    (row) =>
      row.isWabaDefault && normalizeTemplatePurpose(row.purpose) === purpose,
  );
  if (defaults.length !== 1) return false;
  const only = defaults[0];
  if (!only) return false;
  if (template.id == null || only.id == null) return true;
  return only.id === template.id;
}

export function canDeleteAccountWhatsappTemplate(
  template: AccountTemplateLike,
  templates: AccountTemplateLike[],
): boolean {
  return !isSoleWabaDefault(template, templates);
}

export function accountWhatsappTemplatesEmptyCopy(
  whatsappConfigured: boolean,
  purpose: WhatsappTemplatePurpose = DEFAULT_TEMPLATE_PURPOSE,
): string {
  if (!whatsappConfigured) return ACCOUNT_TEMPLATES_EMPTY_NEEDS_SETUP;
  if (purpose === DEFAULT_TEMPLATE_PURPOSE) return ACCOUNT_TEMPLATES_EMPTY_NONE;
  return ACCOUNT_TEMPLATES_EMPTY_PURPOSE;
}

export function accountTemplateDeleteWarning(
  usage?: AccountTemplateUsage | null,
): string {
  const events = usage?.events ?? [];
  const names = events.map((row) => row.name).filter(Boolean);
  const parts: string[] = [];
  if (names.length) {
    parts.push(`La usan: ${names.join(", ")}.`);
  } else if ((usage?.eventCount ?? 0) > 0) {
    parts.push(`La usan ${usage?.eventCount} eventos.`);
  }
  const campaignCount = usage?.campaignEventCount ?? 0;
  if (campaignCount > 0) {
    parts.push(
      campaignCount === 1
        ? "Está como plantilla de campaña en 1 evento."
        : `Está como plantilla de campaña en ${campaignCount} eventos.`,
    );
  }
  parts.push(ACCOUNT_TEMPLATE_DELETE_META_COPY);
  return parts.join(" ");
}

export function customAccountTemplateEditWarning(eventCount: number): string {
  if (eventCount === 1) {
    return "Este cambio toca 1 evento que usa esta plantilla.";
  }
  if (eventCount > 1) {
    return `Este cambio toca ${eventCount} eventos que usan esta plantilla.`;
  }
  return "Esta plantilla no está vinculada a ningún evento.";
}
