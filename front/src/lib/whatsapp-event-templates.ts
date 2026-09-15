import type { EventWhatsappTemplateDto } from "@/lib/api/integrations";
import {
  WIZARD_EXTRA_FIELDS,
  WIZARD_UNIVERSAL_FIELDS,
} from "./whatsapp-template-presets.ts";
import {
  extraSlotOptions,
  mergeEventSlotMappings,
  needsHeaderFile,
  type EventSlotMapping,
  type WizardHeaderType,
} from "./whatsapp-templates.ts";

export const EVENT_TEMPLATE_CAP = 10;
export const DISPLAY_NAME_MAX = 120;
export const DISPLAY_NAME_PREVIEW_MAX = 80;

export const DEFAULT_ACCOUNT_TEMPLATE_BANNER =
  "Esta es la plantilla default de la cuenta. Si la editas y guardas, se crea una copia solo para este evento.";

export const CREATE_EVENT_TEMPLATE_SELECTOR_VALUE = "create";
export const CREATE_EVENT_TEMPLATE_SELECTOR_LABEL =
  "Crear plantilla para este evento";
export const DEFAULT_ACCOUNT_TEMPLATE_SELECTOR_LABEL = "Default de cuenta";

export type EventTemplateCardDraft = {
  slot: number;
  linkId: string | null;
  templateId: string | null;
  displayName: string;
  body: string;
  headerType: WizardHeaderType;
  headerFile: File | null;
  headerFileName: string | null;
  savedHeaderType: WizardHeaderType;
  savedHeaderFileName: string | null;
  isCampaign: boolean;
  isWabaDefault: boolean;
  status: string | null;
  rejectedReason: string | null;
  slotMappings: Record<string, EventSlotMapping>;
  persisted: boolean;
};

export type PrimerContactoSelectorKind =
  | "default"
  | "linked"
  | "library"
  | "create";

export type PrimerContactoSelectorOption = {
  value: string;
  label: string;
  kind: PrimerContactoSelectorKind;
};

export type PrimerContactoSelectorAction =
  | { type: "select-linked"; slot: number }
  | { type: "attach"; templateId: string }
  | { type: "create" };

type SelectorTemplate = {
  id: string | null;
  displayName: string | null;
  body: string;
  isWabaDefault: boolean;
};

type SelectorLink = {
  slot: number;
  template: SelectorTemplate;
};

export function canCreateEventCustomTemplate(linkedCount: number): boolean {
  return linkedCount < EVENT_TEMPLATE_CAP;
}

export function shouldShowDefaultTemplateBanner(input: {
  isWabaDefault?: boolean;
}): boolean {
  return Boolean(input.isWabaDefault);
}

export function shouldConfirmEventTemplateFork(input: {
  isWabaDefault?: boolean;
}): boolean {
  return Boolean(input.isWabaDefault);
}

export function canEditEventExtraMappings(input: {
  isWabaDefault?: boolean;
}): boolean {
  return !input.isWabaDefault;
}

export function extraSlotOptionsForEventTemplate(
  isWabaDefault: boolean,
  extraKeys: string[],
): string[] {
  if (isWabaDefault) return [...WIZARD_EXTRA_FIELDS];
  return extraSlotOptions(extraKeys);
}

export function eventTemplateVariableKeys(
  isWabaDefault: boolean,
  extraKeys: string[],
): string[] {
  if (isWabaDefault) return [...WIZARD_UNIVERSAL_FIELDS];
  return extraKeys;
}

export function normalizeDisplayName(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, DISPLAY_NAME_MAX);
}

export function displayNameOrPreview(template: {
  displayName?: string | null;
  body?: string | null;
}): string | null {
  const named = normalizeDisplayName(template?.displayName);
  if (named) return named;
  const preview = String(template?.body || "")
    .replace(/\{\{\d+\}\}/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  if (!preview) return null;
  return preview.slice(0, DISPLAY_NAME_PREVIEW_MAX);
}

export function eventTemplateSlotFromDto(slot: number): number {
  const numeric = Number(slot);
  if (!Number.isInteger(numeric) || numeric < 1) return 1;
  return numeric;
}

function headerTypeOf(value: string | null | undefined): WizardHeaderType {
  return value === "document" || value === "image" ? value : "none";
}

export function dtoToEventTemplateDraft(
  dto: EventWhatsappTemplateDto,
): EventTemplateCardDraft {
  const headerType = headerTypeOf(dto.template.headerType);
  const body = dto.template.body || "";
  return {
    slot: eventTemplateSlotFromDto(dto.slot),
    linkId: dto.id,
    templateId: dto.template.id,
    displayName: dto.template.displayName || "",
    body,
    headerType,
    headerFile: null,
    headerFileName: dto.template.headerFileName,
    savedHeaderType: headerType,
    savedHeaderFileName: dto.template.headerFileName,
    isCampaign: dto.isCampaign,
    isWabaDefault: Boolean(dto.template.isWabaDefault),
    status: dto.template.status,
    rejectedReason: dto.template.rejectedReason,
    slotMappings: mergeEventSlotMappings(body, dto.slotMappings || {}),
    persisted: true,
  };
}

export function draftsFromEventTemplates(
  templates: EventWhatsappTemplateDto[],
): EventTemplateCardDraft[] {
  return [...templates]
    .map(dtoToEventTemplateDraft)
    .sort((a, b) => a.slot - b.slot);
}

export function blankEventTemplateDraft(
  slot: number,
  isCampaign: boolean,
): EventTemplateCardDraft {
  return {
    slot,
    linkId: null,
    templateId: null,
    displayName: "",
    body: "",
    headerType: "none",
    headerFile: null,
    headerFileName: null,
    savedHeaderType: "none",
    savedHeaderFileName: null,
    isCampaign,
    isWabaDefault: false,
    status: "DRAFT",
    rejectedReason: null,
    slotMappings: mergeEventSlotMappings("", {}),
    persisted: false,
  };
}

function linkedSelectorValue(slot: number): string {
  return `linked:${slot}`;
}

function librarySelectorValue(templateId: string): string {
  return `library:${templateId}`;
}

function templateLabel(template: SelectorTemplate, fallback: string): string {
  return displayNameOrPreview(template) || fallback;
}

export function buildPrimerContactoSelectorOptions(input: {
  accountTemplates: SelectorTemplate[];
  linkedTemplates: SelectorLink[];
}): PrimerContactoSelectorOption[] {
  const options: PrimerContactoSelectorOption[] = [];
  const linkedIds = new Set(
    input.linkedTemplates
      .map((item) => item.template.id)
      .filter((id): id is string => Boolean(id)),
  );
  const accountDefault = input.accountTemplates.find((item) => item.isWabaDefault);
  const linkedDefault = input.linkedTemplates.find(
    (item) =>
      item.template.isWabaDefault ||
      Boolean(accountDefault?.id && item.template.id === accountDefault.id),
  );
  if (accountDefault || linkedDefault) {
    const attachId = accountDefault?.id || linkedDefault?.template.id;
    if (linkedDefault || attachId) {
      options.push({
        value: linkedDefault
          ? linkedSelectorValue(linkedDefault.slot)
          : librarySelectorValue(String(attachId)),
        label: DEFAULT_ACCOUNT_TEMPLATE_SELECTOR_LABEL,
        kind: "default",
      });
    }
  }

  for (const link of [...input.linkedTemplates].sort((a, b) => a.slot - b.slot)) {
    if (link.template.isWabaDefault) continue;
    options.push({
      value: linkedSelectorValue(link.slot),
      label: templateLabel(link.template, `Plantilla ${link.slot}`),
      kind: "linked",
    });
  }

  for (const template of input.accountTemplates) {
    if (template.isWabaDefault || !template.id || linkedIds.has(template.id)) {
      continue;
    }
    options.push({
      value: librarySelectorValue(template.id),
      label: templateLabel(template, "Plantilla de biblioteca"),
      kind: "library",
    });
  }

  if (canCreateEventCustomTemplate(input.linkedTemplates.length)) {
    options.push({
      value: CREATE_EVENT_TEMPLATE_SELECTOR_VALUE,
      label: CREATE_EVENT_TEMPLATE_SELECTOR_LABEL,
      kind: "create",
    });
  }

  return options;
}

export function parsePrimerContactoSelectorValue(
  value: string,
): PrimerContactoSelectorAction | null {
  if (value === CREATE_EVENT_TEMPLATE_SELECTOR_VALUE) return { type: "create" };
  const [kind, rest] = String(value || "").split(":");
  if (kind === "linked") {
    const slot = Number(rest);
    if (!Number.isInteger(slot) || slot < 1) return null;
    return { type: "select-linked", slot };
  }
  if (kind === "library" && rest) {
    return { type: "attach", templateId: rest };
  }
  return null;
}

export function selectorValueForDraft(draft: EventTemplateCardDraft): string {
  if (draft.persisted) return linkedSelectorValue(draft.slot);
  return CREATE_EVENT_TEMPLATE_SELECTOR_VALUE;
}

export function buildCreateEventTemplateFormData(input: {
  source: "blank" | "default";
  displayName: string;
  body: string;
  headerType: string;
  slotMappings: Record<string, EventSlotMapping>;
  headerFile?: File | null;
}): FormData {
  const form = new FormData();
  form.append(
    "payload",
    JSON.stringify({
      source: input.source,
      displayName: input.displayName,
      headerType: input.headerType,
      body: input.body,
      slotMappings: mergeEventSlotMappings(input.body, input.slotMappings),
    }),
  );
  if (input.headerFile && needsHeaderFile(input.headerType)) {
    form.append("header", input.headerFile);
  }
  return form;
}
