const PLACEHOLDER_REGEX = /\{\{(\d+)\}\}/g;
const STARTS_WITH_PLACEHOLDER = /^\{\{\d+\}\}/;
const ENDS_WITH_PLACEHOLDER = /\{\{\d+\}\}$/;
const ADJACENT_PLACEHOLDERS = /\{\{\d+\}\}\s*\{\{\d+\}\}/;
const CANONICAL_PLACEHOLDER_ID = /^[1-9]\d*$/;
const META_BODY_MAX_LENGTH = 1024;
const META_MIN_WORDS_PER_VAR = 2;
const META_MIN_CHARS_PER_VAR = 20;
const META_BODY_ERROR_EMPTY = "El cuerpo no puede estar vacío.";
const META_BODY_ERROR_START =
  "Las variables no pueden ir al principio del mensaje.";
const META_BODY_ERROR_END =
  "Las variables no pueden ir al final del mensaje.";
const META_BODY_ERROR_ADJACENT =
  "No pongas dos variables seguidas. Separa {{1}} y {{2}} con texto.";
const META_BODY_ERROR_DENSITY =
  "Esta plantilla tiene demasiadas variables en relación con su longitud. Reduce el número de variables o aumenta la longitud del mensaje.";
const META_BODY_ERROR_SEQUENCE =
  "Usa {{1}}, {{2}}, {{3}}… en orden, sin saltos. {{1}} es el nombre y {{2}} el número de pases.";
const META_BODY_ERROR_LENGTH = "El cuerpo no puede superar 1024 caracteres.";

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

export function metaTemplateBodyErrors(body: string): string[] {
  const text = String(body || "");
  const trimmed = text.trim();
  const errors: string[] = [];

  if (!trimmed) {
    errors.push(META_BODY_ERROR_EMPTY);
    if (text.length > META_BODY_MAX_LENGTH) {
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
  if (ADJACENT_PLACEHOLDERS.test(text)) {
    errors.push(META_BODY_ERROR_ADJACENT);
  }

  const ids: string[] = [];
  const regex = new RegExp(PLACEHOLDER_REGEX.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) ids.push(match[1]);
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

  const collapsed = text
    .replace(new RegExp(PLACEHOLDER_REGEX.source, "g"), "")
    .replace(/\s+/g, " ")
    .trim();
  const palabras = collapsed.match(/\S+/g) || [];
  const variables = uniqueSorted.length;
  if (
    variables > 0 &&
    (palabras.length < variables * META_MIN_WORDS_PER_VAR ||
      collapsed.length < variables * META_MIN_CHARS_PER_VAR)
  ) {
    errors.push(META_BODY_ERROR_DENSITY);
  }

  if (text.length > META_BODY_MAX_LENGTH) {
    errors.push(META_BODY_ERROR_LENGTH);
  }

  return errors;
}

export function wizardBodyError(body: string): string | null {
  return metaTemplateBodyErrors(body)[0] ?? null;
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
  if (drafts.length === 0 || !drafts.every(isWizardCardReady)) return [];
  const templates = drafts.slice(0, 2);
  if (templates.length === 1 || !templates.some((draft) => draft.isCampaign)) {
    return templates.map((draft, index) => ({
      ...draft,
      isCampaign: index === 0,
    }));
  }
  return templates;
}

export const LITERAL_SLOT_OPTION = "__literal__";

export const LOCKED_SLOT_MAPPINGS = {
  "1": { type: "field" as const, key: "nombre" },
  "2": { type: "field" as const, key: "numero_invitados" },
};

export type EventSlotMapping =
  { type: "field"; key: string } | { type: "literal"; value: string } | null;

export function extraSlotOptions(keys: string[]): string[] {
  return [...keys, LITERAL_SLOT_OPTION];
}

export function extraSlotOptionLabel(option: string): string {
  return option === LITERAL_SLOT_OPTION ? "Texto fijo" : option;
}

export function extraPlaceholderIds(body: string): string[] {
  return extractBodyPlaceholders(body).filter((id) => id !== "1" && id !== "2");
}

export function eventTemplateBodyError(body: string): string | null {
  return wizardBodyError(body);
}

function isCompleteMapping(
  mapping: EventSlotMapping | undefined,
): mapping is Exclude<EventSlotMapping, null> {
  if (!mapping) return false;
  if (mapping.type === "field")
    return Boolean(String(mapping.key || "").trim());
  if (mapping.type === "literal") {
    return Boolean(String(mapping.value || "").trim());
  }
  return false;
}

export function extraMappingsComplete(
  body: string,
  mappings: Record<string, EventSlotMapping>,
): boolean {
  return extraPlaceholderIds(body).every((id) =>
    isCompleteMapping(mappings[id]),
  );
}

export function mergeEventSlotMappings(
  body: string,
  incoming: Record<string, EventSlotMapping> = {},
): Record<string, EventSlotMapping> {
  const mappings: Record<string, EventSlotMapping> = {};
  for (const id of extractBodyPlaceholders(body)) {
    if (id === "1") mappings["1"] = LOCKED_SLOT_MAPPINGS["1"];
    else if (id === "2") mappings["2"] = LOCKED_SLOT_MAPPINGS["2"];
    else mappings[id] = incoming[id] ?? null;
  }
  return mappings;
}

export function isEventTemplateCardReady(draft: {
  body: string;
  headerType: string;
  headerFile?: File | null;
  headerFileName?: string | null;
  slotMappings: Record<string, EventSlotMapping>;
}): boolean {
  if (eventTemplateBodyError(draft.body) !== null) return false;
  const mappings = mergeEventSlotMappings(draft.body, draft.slotMappings);
  if (!extraMappingsComplete(draft.body, mappings)) return false;
  if (
    needsHeaderFile(draft.headerType) &&
    !draft.headerFile &&
    !draft.headerFileName
  ) {
    return false;
  }
  return true;
}

export function buildEventTemplateFormData(input: {
  body: string;
  headerType: string;
  slotMappings: Record<string, EventSlotMapping>;
  isCampaign: boolean;
  headerFile?: File | null;
}): FormData {
  const form = new FormData();
  form.append(
    "payload",
    JSON.stringify({
      body: input.body,
      headerType: input.headerType,
      slotMappings: mergeEventSlotMappings(input.body, input.slotMappings),
      isCampaign: input.isCampaign,
    }),
  );
  if (input.headerFile && needsHeaderFile(input.headerType)) {
    form.append("header", input.headerFile);
  }
  return form;
}

export function campaignTemplateStatus(
  templates: Array<{
    isCampaign: boolean;
    template: { status: string | null };
  }>,
): string | null {
  return templates.find((row) => row.isCampaign)?.template.status ?? null;
}

export function isCampaignLaunchBlocked(
  status: string | null,
  loadError: boolean,
): boolean {
  if (loadError) return false;
  return status !== "APPROVED";
}

export function shouldShowEventTemplateCards(
  loading: boolean,
  loadError: boolean,
): boolean {
  return !loading && !loadError;
}

export function statusBadgeClassName(
  status: string | null | undefined,
): string {
  switch (status) {
    case "APPROVED":
      return "bg-success-soft text-success border-transparent";
    case "REJECTED":
      return "bg-rose text-rose-foreground border-transparent";
    case "PENDING":
      return "bg-warning-soft text-warning border-transparent";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function canSubmitWizard(drafts: WizardTemplateDraft[]): boolean {
  return drafts.length >= 1 && drafts.every(isWizardCardReady);
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
