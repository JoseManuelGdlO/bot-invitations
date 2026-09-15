export const ACCOUNT_TEMPLATES_EMPTY_NEEDS_SETUP =
  "Conecta WhatsApp y completa el wizard";
export const ACCOUNT_TEMPLATES_EMPTY_NONE = "Aún no hay plantillas";

export const LAST_WABA_DEFAULT_DELETE_HINT =
  "No se puede borrar la única plantilla default de la cuenta.";

export const ACCOUNT_TEMPLATE_DELETE_META_COPY =
  "Se borra también en Meta y no se puede deshacer.";

export type AccountTemplateLike = {
  id: string | null;
  isWabaDefault: boolean;
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
  const defaults = templates.filter((row) => row.isWabaDefault);
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
): string {
  return whatsappConfigured
    ? ACCOUNT_TEMPLATES_EMPTY_NONE
    : ACCOUNT_TEMPLATES_EMPTY_NEEDS_SETUP;
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
