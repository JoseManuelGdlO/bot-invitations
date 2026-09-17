export const TEMPLATE_PURPOSES = ["invitation", "reminder", "followup"] as const;

export type WhatsappTemplatePurpose = (typeof TEMPLATE_PURPOSES)[number];

export const DEFAULT_TEMPLATE_PURPOSE: WhatsappTemplatePurpose = "invitation";

export const PURPOSE_TAB_LABEL: Record<WhatsappTemplatePurpose, string> = {
  invitation: "Mensajes",
  reminder: "Recordatorio",
  followup: "Seguimiento",
};

export const PURPOSE_HINT: Record<WhatsappTemplatePurpose, string> = {
  invitation:
    "Campaña inicial de WhatsApp. Meta debe aprobar cada plantilla antes de usarla en el envío masivo.",
  reminder:
    "Recordatorio automático. Elige cuál se usa en los envíos de recordatorio.",
  followup:
    "Recontacto a indecisos, según las reglas de seguimiento.",
};

export const PURPOSE_CAMPAIGN_RADIO_TITLE: Record<WhatsappTemplatePurpose, string> = {
  invitation: "Usar en campaña",
  reminder: "Usar en recordatorios",
  followup: "Usar en seguimiento",
};

export const PURPOSE_CAMPAIGN_RADIO_HINT: Record<WhatsappTemplatePurpose, string> = {
  invitation: "Solo esta plantilla se usa para el primer contacto masivo.",
  reminder: "Solo esta plantilla se usa en los recordatorios automáticos y manuales.",
  followup: "Solo esta plantilla se usa en el recontacto a indecisos.",
};

export function normalizeTemplatePurpose(
  value: string | null | undefined,
): WhatsappTemplatePurpose {
  const purpose = String(value || "").trim().toLowerCase();
  return (TEMPLATE_PURPOSES as readonly string[]).includes(purpose)
    ? (purpose as WhatsappTemplatePurpose)
    : DEFAULT_TEMPLATE_PURPOSE;
}

export function templatesForPurpose<T extends { purpose?: string | null }>(
  templates: T[],
  purpose: WhatsappTemplatePurpose,
): T[] {
  return templates.filter(
    (row) => normalizeTemplatePurpose(row.purpose) === purpose,
  );
}

export function showsInvitationPresets(
  purpose: WhatsappTemplatePurpose,
): boolean {
  return normalizeTemplatePurpose(purpose) === DEFAULT_TEMPLATE_PURPOSE;
}
