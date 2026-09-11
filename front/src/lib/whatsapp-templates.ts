const PLACEHOLDER_REGEX = /\{\{(\d+)\}\}/g;

const WIZARD_BODY_ERROR = "Incluye {{1}} (nombre) y {{2}} (número de pases).";

const STATUS_BADGE_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  PENDING: "En revisión",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  PAUSED: "Pausada",
  DISABLED: "Pausada",
};

export type WizardHeaderType = "none" | "document" | "image";

export type WizardTemplateDraft = {
  slot: 1 | 2;
  headerType: WizardHeaderType;
  body: string;
  isCampaign: boolean;
  headerFile: File | null;
};

export function extractBodyPlaceholders(body: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const regex = new RegExp(PLACEHOLDER_REGEX.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(String(body || ""))) !== null) {
    const id = match[1];
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids.sort((a, b) => Number(a) - Number(b));
}

export function wizardBodyError(body: string): string | null {
  const ids = extractBodyPlaceholders(body);
  if (ids.length === 2 && ids[0] === "1" && ids[1] === "2") return null;
  return WIZARD_BODY_ERROR;
}

export function statusBadgeLabel(status: string): string {
  return STATUS_BADGE_LABELS[status] ?? status;
}

export function needsHeaderFile(headerType: string): boolean {
  return headerType === "document" || headerType === "image";
}

export function isWizardCardReady(draft: {
  body: string;
  headerType: string;
  headerFile?: File | null;
}): boolean {
  if (wizardBodyError(draft.body) !== null) return false;
  if (needsHeaderFile(draft.headerType) && !draft.headerFile) return false;
  return true;
}

export function wizardDraftsToSubmit(
  drafts: WizardTemplateDraft[],
): WizardTemplateDraft[] {
  const ready = drafts.filter((draft) => isWizardCardReady(draft)).slice(0, 2);
  if (ready.length === 0) return [];
  if (ready.length === 1 || !ready.some((draft) => draft.isCampaign)) {
    return ready.map((draft, index) => ({
      ...draft,
      isCampaign: index === 0,
    }));
  }
  return ready;
}

export function canSubmitWizard(drafts: WizardTemplateDraft[]): boolean {
  return wizardDraftsToSubmit(drafts).length >= 1;
}

export function buildWizardFormData(drafts: WizardTemplateDraft[]): FormData {
  const templates = wizardDraftsToSubmit(drafts);
  const form = new FormData();
  form.append(
    "payload",
    JSON.stringify({
      templates: templates.map((draft) => ({
        slot: draft.slot,
        headerType: draft.headerType,
        body: draft.body,
        isCampaign: draft.isCampaign,
      })),
    }),
  );
  for (const draft of templates) {
    if (draft.headerFile && needsHeaderFile(draft.headerType)) {
      form.append(`header_${draft.slot}`, draft.headerFile);
    }
  }
  return form;
}
