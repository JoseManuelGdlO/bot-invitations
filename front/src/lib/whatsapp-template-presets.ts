import {
  LOCKED_SLOT_MAPPINGS,
  mergeEventSlotMappings,
  type EventSlotMapping,
  type WizardHeaderType,
} from "./whatsapp-templates.ts";

export const WIZARD_UNIVERSAL_FIELDS = [
  "nombre",
  "numero_invitados",
  "evento",
  "fecha",
  "lugar",
  "direccion",
  "hora",
  "planner",
  "nombre_completo",
] as const;

export const WIZARD_EXTRA_FIELDS = WIZARD_UNIVERSAL_FIELDS.filter(
  (key) => key !== "nombre" && key !== "numero_invitados",
);

export type WizardPresetId = "formal" | "cercano" | "evento";

export type WizardPreset = {
  id: WizardPresetId;
  displayName: string;
  headerType: WizardHeaderType;
  body: string;
  slotMappings: Record<string, EventSlotMapping>;
};

const LOCKED = {
  "1": LOCKED_SLOT_MAPPINGS["1"],
  "2": LOCKED_SLOT_MAPPINGS["2"],
} as const;

function field(key: string): EventSlotMapping {
  return { type: "field", key };
}

export const WIZARD_PRESETS: WizardPreset[] = [
  {
    id: "formal",
    displayName: "Invitación formal",
    headerType: "none",
    body: "Hola {{1}}, te escribimos para invitarte con mucho gusto a nuestra celebración. Reservamos {{2}} pases a tu nombre. Confírmanos tu asistencia por este chat cuando puedas, por favor.",
    slotMappings: { ...LOCKED },
  },
  {
    id: "cercano",
    displayName: "Invitación cercana",
    headerType: "none",
    body: "¡Hola {{1}}! Qué gusto saludarte. Guardamos {{2}} lugares para ti en nuestra celebración. Responde a este mensaje para confirmar si nos acompañas, por favor.",
    slotMappings: { ...LOCKED },
  },
  {
    id: "evento",
    displayName: "Invitación con fecha y lugar",
    headerType: "none",
    body: "Hola {{1}}, te invitamos a {{3}}. Reservamos {{2}} pases a tu nombre. Te esperamos el {{4}} en {{5}}. Confirma tu asistencia respondiendo este mensaje, por favor.",
    slotMappings: {
      ...LOCKED,
      "3": field("evento"),
      "4": field("fecha"),
      "5": field("lugar"),
    },
  },
];

export function wizardPresetById(id: WizardPresetId): WizardPreset {
  const preset = WIZARD_PRESETS.find((item) => item.id === id);
  if (!preset) {
    throw new Error(`Preset de plantilla desconocido: ${id}`);
  }
  return preset;
}

export function matchWizardPreset(body: string): WizardPreset | null {
  return WIZARD_PRESETS.find((preset) => preset.body === body) ?? null;
}

export function isWizardBodyDirty(
  body: string,
  preset: WizardPreset | null,
): boolean {
  if (!preset) return Boolean(String(body || "").trim());
  return String(body || "") !== preset.body;
}

export function mappingsFromAccountTemplate(
  body: string,
  incoming?: Record<string, EventSlotMapping> | null,
): Record<string, EventSlotMapping> {
  const fromApi =
    incoming && Object.keys(incoming).length > 0 ? incoming : null;
  const matched = matchWizardPreset(body);
  return mergeEventSlotMappings(
    body,
    fromApi || matched?.slotMappings || {},
  );
}
