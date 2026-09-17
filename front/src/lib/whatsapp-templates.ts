import {
  DEFAULT_TEMPLATE_PURPOSE,
  PURPOSE_TAB_LABEL,
  normalizeTemplatePurpose,
} from "./whatsapp-template-purpose.ts";

const PLACEHOLDER_REGEX = /\{\{(\d+)\}\}/g;
const STARTS_WITH_PLACEHOLDER = /^\{\{\d+\}\}/;
const ENDS_WITH_PLACEHOLDER = /\{\{\d+\}\}$/;
const ADJACENT_PLACEHOLDERS = /\{\{\d+\}\}\s*\{\{\d+\}\}/;
const CANONICAL_PLACEHOLDER_ID = /^[1-9]\d*$/;
const META_BODY_MAX_LENGTH = 1024;
const META_MIN_WORDS_PER_VAR = 2;
const META_BODY_ERROR_EMPTY = "El cuerpo no puede estar vacío.";
const META_BODY_ERROR_START =
  "Las variables no pueden ir al principio del mensaje.";
const META_BODY_ERROR_END = "Las variables no pueden ir al final del mensaje.";
const META_BODY_ERROR_ADJACENT =
  "No pongas dos variables seguidas. Separa {{1}} y {{2}} con texto.";
const META_BODY_ERROR_DENSITY =
  "Esta plantilla tiene demasiadas variables en relación con su longitud. Reduce el número de variables o aumenta la longitud del mensaje.";
const META_BODY_ERROR_REQUIRED =
  "Incluye {{1}} (nombre) y {{2}} (número de pases). Las dos son obligatorias.";
const META_BODY_ERROR_SEQUENCE =
  "Usa {{1}}, {{2}}, {{3}}… en orden, sin saltos. {{1}} es el nombre y {{2}} el número de pases.";
const META_BODY_ERROR_LENGTH = "El cuerpo no puede superar 1024 caracteres.";
const META_BODY_ERROR_HEADER_IMAGE =
  "Falta el archivo de encabezado (JPEG o PNG de hasta 5 MB).";
const META_BODY_ERROR_HEADER_DOCUMENT =
  "Falta el archivo de encabezado (PDF o Word de hasta 10 MB).";

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
  displayName: string;
  headerType: WizardHeaderType;
  body: string;
  headerFile: File | null;
  headerFileName?: string | null;
  slotMappings: Record<string, EventSlotMapping>;
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
  if (uniqueSorted.length < 2) {
    errors.push(META_BODY_ERROR_REQUIRED);
  } else if (
    ids.some((id) => !CANONICAL_PLACEHOLDER_ID.test(id)) ||
    uniqueSorted.length !== ids.length ||
    uniqueSorted.some((id, index) => id !== String(index + 1))
  ) {
    errors.push(META_BODY_ERROR_SEQUENCE);
  }

  const collapsed = text
    .replace(new RegExp(PLACEHOLDER_REGEX.source, "g"), "")
    .replace(/\s+/g, " ")
    .trim();
  const palabras = collapsed.match(/\S+/g) || [];
  const variables = uniqueSorted.length;
  if (variables > 0 && palabras.length < variables * META_MIN_WORDS_PER_VAR) {
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

export const META_TEMPLATE_PENDING_EDIT_HINT =
  "No se puede editar una plantilla en revisión";

export function isMetaTemplateInReview(
  status: string | null | undefined,
): boolean {
  return status === "PENDING";
}

export function metaTemplateStatusHint(
  status: string | null | undefined,
): string {
  switch (status) {
    case "PENDING":
      return "En revisión de Meta. No se puede usar en envíos hasta que la aprueben.";
    case "APPROVED":
      return "Aprobada. Lista para envíos y campaña.";
    case "REJECTED":
      return "Meta la rechazó. Edítala y vuelve a enviarla a revisión.";
    case "PAUSED":
    case "DISABLED":
      return "Pausada. No se usa en envíos hasta que vuelva a estar aprobada.";
    default:
      return "";
  }
}

export function needsHeaderFile(headerType: string): boolean {
  return headerType === "document" || headerType === "image";
}

export function wizardCardBlockReason(draft: {
  body: string;
  headerType: string;
  headerFile?: File | null;
  headerFileName?: string | null;
  slotMappings?: Record<string, EventSlotMapping>;
}): string | null {
  const bodyError = metaTemplateBodyErrors(draft.body)[0];
  if (bodyError) return bodyError;
  const mappings = mergeEventSlotMappings(draft.body, draft.slotMappings || {});
  const mappingNotice = unmappedExtraNotices(draft.body, mappings)[0];
  if (mappingNotice) return mappingNotice;
  if (
    needsHeaderFile(draft.headerType) &&
    !draft.headerFile &&
    !draft.headerFileName
  ) {
    return draft.headerType === "image"
      ? META_BODY_ERROR_HEADER_IMAGE
      : META_BODY_ERROR_HEADER_DOCUMENT;
  }
  return null;
}

export function isWizardCardReady(draft: {
  body: string;
  headerType: string;
  headerFile?: File | null;
  headerFileName?: string | null;
  slotMappings?: Record<string, EventSlotMapping>;
}): boolean {
  return wizardCardBlockReason(draft) === null;
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

export function unmappedExtraNotices(
  body: string,
  mappings: Record<string, EventSlotMapping>,
): string[] {
  return extraPlaceholderIds(body)
    .filter((id) => !isCompleteMapping(mappings[id]))
    .map((id) => `Elige qué significa {{${id}}}.`);
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

export type InsertWizardVariableInput = {
  body: string;
  cursorStart: number;
  cursorEnd: number;
  fieldKey: string;
  slotMappings?: Record<string, EventSlotMapping>;
  emptyFallback?: {
    body: string;
    slotMappings: Record<string, EventSlotMapping>;
    displayName?: string;
    headerType?: WizardHeaderType;
  };
};

export type InsertWizardVariableResult = {
  body: string;
  slotMappings: Record<string, EventSlotMapping>;
  selectionStart: number;
  selectionEnd: number;
  error: string | null;
  usedFallback: boolean;
  alreadyPresent: boolean;
  displayName?: string;
  headerType?: WizardHeaderType;
};

function placeholderIdForField(
  fieldKey: string,
  body: string,
  mappings: Record<string, EventSlotMapping>,
): string {
  if (fieldKey === "nombre") return "1";
  if (fieldKey === "numero_invitados") return "2";
  for (const [id, mapping] of Object.entries(mappings)) {
    if (id === "1" || id === "2") continue;
    if (mapping?.type === "field" && mapping.key === fieldKey) return id;
  }
  const ids = extractBodyPlaceholders(body).map(Number);
  const next = Math.max(2, 0, ...ids) + 1;
  return String(Math.max(next, 3));
}

function bodyHasPlaceholder(body: string, id: string): boolean {
  return body.includes(`{{${id}}}`);
}

function cursorAtStart(body: string, start: number): boolean {
  const lead = body.length - body.trimStart().length;
  return start <= lead;
}

function cursorAtEnd(body: string, start: number): boolean {
  return start >= body.trimEnd().length;
}

function insidePlaceholder(body: string, index: number): boolean {
  const regex = new RegExp(PLACEHOLDER_REGEX.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) !== null) {
    if (index > match.index && index < match.index + match[0].length) {
      return true;
    }
  }
  return false;
}

function wouldBeAdjacent(body: string, index: number): boolean {
  return (
    /\{\{\d+\}\}\s*$/.test(body.slice(0, index)) ||
    /^\s*\{\{\d+\}\}/.test(body.slice(index))
  );
}

function isWordBoundary(body: string, index: number): boolean {
  if (index <= 0 || index >= body.length) return false;
  return (
    /[\s.,;:!?…]/.test(body[index - 1] ?? "") ||
    /[\s.,;:!?…]/.test(body[index] ?? "")
  );
}

function isValidInsertIndex(body: string, index: number): boolean {
  if (index < 0 || index > body.length) return false;
  if (cursorAtStart(body, index) || cursorAtEnd(body, index)) return false;
  if (insidePlaceholder(body, index)) return false;
  if (wouldBeAdjacent(body, index)) return false;
  return true;
}

function pickInsertIndex(
  body: string,
  candidates: Array<number | null | undefined>,
  preferBoundary = false,
): number | null {
  for (const index of candidates) {
    if (index == null) continue;
    if (!isValidInsertIndex(body, index)) continue;
    if (preferBoundary && !isWordBoundary(body, index)) continue;
    return index;
  }
  return null;
}

function nudgeWizardInsertCursor(body: string, start: number): number | null {
  const clamped = Math.max(0, Math.min(start, body.length));
  const exact = pickInsertIndex(body, [clamped]);
  if (exact != null) return exact;

  if (cursorAtEnd(body, clamped) || clamped >= body.trimEnd().length) {
    const trimmed = body.trimEnd();
    const punct = trimmed.match(/[.!?…]+$/)?.[0].length ?? 0;
    const beforePunct = trimmed.length - punct;
    const atEnd = pickInsertIndex(
      body,
      [beforePunct, trimmed.lastIndexOf(" ")],
      true,
    ) ?? pickInsertIndex(body, [beforePunct, trimmed.lastIndexOf(" ")]);
    if (atEnd != null) return atEnd;
  }

  for (let distance = 1; distance <= body.length; distance++) {
    const hit = pickInsertIndex(
      body,
      [clamped - distance, clamped + distance],
      true,
    );
    if (hit != null) return hit;
  }
  for (let distance = 1; distance <= body.length; distance++) {
    const hit = pickInsertIndex(body, [clamped - distance, clamped + distance]);
    if (hit != null) return hit;
  }
  return null;
}

export function insertWizardVariable(
  input: InsertWizardVariableInput,
): InsertWizardVariableResult {
  const body = String(input.body || "");
  const mappings = mergeEventSlotMappings(body, input.slotMappings || {});
  const unchanged = (
    patch: Partial<InsertWizardVariableResult> = {},
  ): InsertWizardVariableResult => ({
    body,
    slotMappings: mappings,
    selectionStart: input.cursorStart,
    selectionEnd: input.cursorEnd,
    error: null,
    usedFallback: false,
    alreadyPresent: false,
    ...patch,
  });

  if (!body.trim()) {
    if (input.emptyFallback) {
      const result: InsertWizardVariableResult = {
        body: input.emptyFallback.body,
        slotMappings: input.emptyFallback.slotMappings,
        selectionStart: input.emptyFallback.body.length,
        selectionEnd: input.emptyFallback.body.length,
        error: null,
        usedFallback: true,
        alreadyPresent: false,
      };
      if (input.emptyFallback.displayName) {
        result.displayName = input.emptyFallback.displayName;
      }
      if (input.emptyFallback.headerType) {
        result.headerType = input.emptyFallback.headerType;
      }
      return result;
    }
    return unchanged({ error: META_BODY_ERROR_EMPTY });
  }

  const id = placeholderIdForField(input.fieldKey, body, mappings);
  const token = `{{${id}}}`;
  if (bodyHasPlaceholder(body, id)) {
    const index = body.indexOf(token);
    return unchanged({
      alreadyPresent: true,
      selectionStart: index < 0 ? input.cursorStart : index,
      selectionEnd: index < 0 ? input.cursorEnd : index + token.length,
    });
  }

  const requested = Math.max(
    0,
    Math.min(input.cursorStart, input.cursorEnd, body.length),
  );
  const from = nudgeWizardInsertCursor(body, requested);
  if (from == null) {
    if (cursorAtStart(body, requested)) {
      return unchanged({ error: META_BODY_ERROR_START });
    }
    if (cursorAtEnd(body, requested)) {
      return unchanged({ error: META_BODY_ERROR_END });
    }
    return unchanged({ error: META_BODY_ERROR_ADJACENT });
  }
  const to =
    requested === from
      ? Math.max(
          from,
          Math.min(Math.max(input.cursorStart, input.cursorEnd), body.length),
        )
      : from;

  const leftPad = from > 0 && !/\s$/.test(body.slice(0, from)) ? " " : "";
  const rightPad = to < body.length && !/^\s/.test(body.slice(to)) ? " " : "";
  const insert = `${leftPad}${token}${rightPad}`;
  const nextBody = `${body.slice(0, from)}${insert}${body.slice(to)}`;
  const pos = from + insert.length;

  return {
    body: nextBody,
    slotMappings: mergeEventSlotMappings(nextBody, {
      ...mappings,
      [id]: { type: "field", key: input.fieldKey },
    }),
    selectionStart: pos,
    selectionEnd: pos,
    error: null,
    usedFallback: false,
    alreadyPresent: false,
  };
}

export function isEventTemplateCardReady(draft: {
  body: string;
  headerType: string;
  headerFile?: File | null;
  headerFileName?: string | null;
  slotMappings: Record<string, EventSlotMapping>;
}): boolean {
  return isWizardCardReady(draft);
}

export function buildEventTemplateFormData(input: {
  displayName?: string | null;
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
      ...(input.displayName !== undefined
        ? { displayName: input.displayName }
        : {}),
    }),
  );
  if (input.headerFile && needsHeaderFile(input.headerType)) {
    form.append("header", input.headerFile);
  }
  return form;
}

type CampaignTemplateRow = {
  isCampaign: boolean;
  template: { status: string | null; purpose?: string | null };
};

function isCampaignInvitation(row: CampaignTemplateRow): boolean {
  return (
    row.isCampaign &&
    normalizeTemplatePurpose(row.template.purpose) === DEFAULT_TEMPLATE_PURPOSE
  );
}

export function campaignTemplateStatus(
  templates: CampaignTemplateRow[],
): string | null {
  return templates.find(isCampaignInvitation)?.template.status ?? null;
}

const SECONDARY_CAMPAIGN_PURPOSES = ["reminder", "followup"] as const;

export type SecondaryCampaignPurpose =
  (typeof SECONDARY_CAMPAIGN_PURPOSES)[number];

export function unapprovedSecondaryCampaignPurposes(
  templates: CampaignTemplateRow[],
): SecondaryCampaignPurpose[] {
  return SECONDARY_CAMPAIGN_PURPOSES.filter((purpose) => {
    const row = templates.find(
      (item) =>
        item.isCampaign &&
        normalizeTemplatePurpose(item.template.purpose) === purpose,
    );
    return Boolean(row && row.template.status !== "APPROVED");
  });
}

export function secondaryCampaignLaunchNotice(
  purposes: SecondaryCampaignPurpose[],
): string {
  if (!purposes.length) return "";
  const labels = purposes.map((purpose) => PURPOSE_TAB_LABEL[purpose]);
  const names =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
  const singular = purposes.length === 1;
  return singular
    ? `La plantilla de ${names} aún no está aprobada. Puedes lanzar igual: esos mensajes se enviarán solos cuando Meta la apruebe. Si llega el día programado y sigue sin estar lista, el envío se aplaza al día siguiente.`
    : `Las plantillas de ${names} aún no están aprobadas. Puedes lanzar igual: esos mensajes se enviarán solos cuando Meta las apruebe. Si llega el día programado y siguen sin estar listas, el envío se aplaza al día siguiente.`;
}

export const WHATSAPP_SETUP_CTA_LABEL = "Conectar WhatsApp";
export const WHATSAPP_SETUP_CTA_DESCRIPTION =
  "Primero debes configurar tu cuenta de WhatsApp para crear y enviar plantillas de este evento.";
export const CAMPAIGN_LAUNCH_WHATSAPP_SETUP_DESCRIPTION =
  "Primero debes configurar tu cuenta de WhatsApp.";
export const CAMPAIGN_LAUNCH_TEMPLATE_NOT_APPROVED =
  "No puedes lanzar todavía: Meta aún no aprueba la plantilla de primer contacto. Cuando en Mensajes del evento figure como Aprobada, vuelve aquí.";
export const CAMPAIGN_LAUNCH_TEMPLATES_UNAVAILABLE =
  "No pudimos comprobar tus plantillas, intenta de nuevo.";
export const WHATSAPP_CONNECTED_NEXT_STEP =
  "Crea la plantilla de invitación y espera a que Meta la apruebe.";

function errorStatus(err: unknown): number | null {
  if (!err || typeof err !== "object" || !("status" in err)) return null;
  const status = Number((err as { status: unknown }).status);
  return Number.isFinite(status) ? status : null;
}

export function isWhatsAppUnconfiguredError(err: unknown): boolean {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!/no está configurado/i.test(message)) return false;
  if (!/whatsapp|meta/i.test(message)) return false;
  const status = errorStatus(err);
  return status == null || status === 400;
}

export type EventTemplatesLoadUi = {
  whatsappConfigured: boolean;
  showWhatsAppSetupCta: boolean;
  error: string;
};

export function eventTemplatesLoadUi(input: {
  statusConfigured: boolean | null;
  listError?: unknown;
}): EventTemplatesLoadUi {
  const listError = input.listError ?? null;
  const errorMessage = listError
    ? listError instanceof Error
      ? listError.message
      : "No se pudieron cargar las plantillas de Meta."
    : "";
  const unconfiguredError = Boolean(
    listError && isWhatsAppUnconfiguredError(listError),
  );

  if (input.statusConfigured === false) {
    return {
      whatsappConfigured: false,
      showWhatsAppSetupCta: true,
      error: "",
    };
  }

  if (input.statusConfigured === true) {
    return {
      whatsappConfigured: true,
      showWhatsAppSetupCta: false,
      error: errorMessage,
    };
  }

  if (unconfiguredError) {
    return {
      whatsappConfigured: false,
      showWhatsAppSetupCta: true,
      error: "",
    };
  }

  if (listError) {
    return {
      whatsappConfigured: false,
      showWhatsAppSetupCta: false,
      error: errorMessage,
    };
  }

  return {
    whatsappConfigured: true,
    showWhatsAppSetupCta: false,
    error: "",
  };
}

export function isCampaignLaunchBlocked(
  status: string | null,
  loadError: boolean,
  whatsappConfigured = true,
): boolean {
  if (!whatsappConfigured) return true;
  if (loadError) return true;
  return status !== "APPROVED";
}

export function shouldShowEventTemplateCards(
  loading: boolean,
  loadError: boolean,
  whatsappConfigured = true,
): boolean {
  return !loading && !loadError && whatsappConfigured;
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

export function canSubmitWizard(draft: WizardTemplateDraft): boolean {
  return isWizardCardReady(draft);
}

export function buildWizardFormData(draft: WizardTemplateDraft): FormData {
  const form = new FormData();
  form.append(
    "payload",
    JSON.stringify({
      displayName: draft.displayName,
      headerType: draft.headerType,
      body: draft.body,
      slotMappings: mergeEventSlotMappings(draft.body, draft.slotMappings),
    }),
  );
  if (draft.headerFile && needsHeaderFile(draft.headerType)) {
    form.append("header_1", draft.headerFile);
  }
  return form;
}
