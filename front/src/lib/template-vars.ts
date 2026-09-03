import { formatDate } from "./mock/format.ts";
import type { EventItem, Guest } from "./mock/types.ts";

export const TEMPLATE_VARIABLES = [
  "nombre",
  "nombre_completo",
  "numero_invitados",
  "numero_confirmados",
  "mesa",
  "familia",
  "tipo",
  "notas",
  "etiqueta",
  "evento",
  "fecha",
  "lugar",
  "direccion",
  "hora",
  "planner",
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export function isTemplateVariable(value: string): value is TemplateVariable {
  return (TEMPLATE_VARIABLES as readonly string[]).includes(value);
}

export function extraTemplateKeys(guests: Guest[]) {
  const keys = new Set<string>();
  for (const guest of guests) {
    const data = guest.customData;
    if (!data || typeof data !== "object") continue;
    for (const key of Object.keys(data)) {
      if (/^\w+$/.test(key) && !isTemplateVariable(key)) keys.add(key);
    }
  }
  return [...keys].sort();
}

const ALWAYS_TEMPLATE_KEYS: readonly TemplateVariable[] = [
  "nombre",
  "nombre_completo",
  "numero_invitados",
  "numero_confirmados",
  "evento",
  "fecha",
  "lugar",
  "hora",
  "planner",
];

const OPTIONAL_GUEST_KEYS: {
  key: TemplateVariable;
  field: keyof Guest;
}[] = [
  { key: "mesa", field: "table" },
  { key: "familia", field: "family" },
  { key: "tipo", field: "guestType" },
  { key: "notas", field: "notes" },
  { key: "etiqueta", field: "tag" },
];

function hasValue(value: unknown) {
  return String(value ?? "").trim() !== "";
}

export function availableTemplateKeys(
  guests: Guest[],
  event: EventItem | undefined,
) {
  const present = new Set<string>(ALWAYS_TEMPLATE_KEYS);
  if (event && hasValue(event.address)) present.add("direccion");
  for (const { key, field } of OPTIONAL_GUEST_KEYS) {
    if (guests.some((guest) => hasValue(guest[field]))) present.add(key);
  }
  const core = TEMPLATE_VARIABLES.filter((key) => present.has(key));
  return [...core, ...extraTemplateKeys(guests)];
}

export function normalizeGreetingVar(
  value: string | null | undefined,
): TemplateVariable {
  const key = String(value || "").trim();
  return isTemplateVariable(key) ? key : "nombre";
}

export function flattenTemplateLine(value: string | null | undefined) {
  return String(value || "")
    .replace(/\\n/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function composeConstructorTemplate(
  greetingVar: string,
  body: string,
) {
  const key = normalizeGreetingVar(greetingVar);
  return `¡Hola, buen día! {{${key}}}\nNos comunicamos de ${flattenTemplateLine(body)}\nMuchas gracias.`;
}

export type MetaBodySegment =
  | { type: "text"; value: string }
  | { type: "slot"; key: string; index: number };

const META_PLACEHOLDER_RE = /\{\{([0-9]+|[A-Za-z_][A-Za-z0-9_]*)\}\}/g;

export function splitMetaBody(text: string): MetaBodySegment[] {
  const segments: MetaBodySegment[] = [];
  const raw = String(text || "");
  const seen = new Map<string, number>();
  let last = 0;
  let nextIndex = 0;
  for (const match of raw.matchAll(META_PLACEHOLDER_RE)) {
    const start = match.index ?? 0;
    if (start > last) {
      segments.push({ type: "text", value: raw.slice(last, start) });
    }
    const key = match[1];
    let index = seen.get(key);
    if (index === undefined) {
      index = nextIndex;
      seen.set(key, nextIndex);
      nextIndex += 1;
    }
    segments.push({ type: "slot", key, index });
    last = start + match[0].length;
  }
  if (last < raw.length) {
    segments.push({ type: "text", value: raw.slice(last) });
  }
  return segments;
}

export function metaBodyParameterKeys(text: string) {
  return splitMetaBody(text)
    .filter((segment): segment is Extract<MetaBodySegment, { type: "slot" }> => segment.type === "slot")
    .filter((segment, i, list) => list.findIndex((item) => item.key === segment.key) === i)
    .map((segment) => segment.key);
}

export function fillMetaBody(bodyText: string, values: string[], keys?: string[]) {
  const orderedKeys = keys?.length ? keys : metaBodyParameterKeys(bodyText);
  const map: Record<string, string> = {};
  orderedKeys.forEach((key, i) => {
    map[key] = values[i] ?? "";
  });
  return String(bodyText || "").replace(META_PLACEHOLDER_RE, (full, key: string) =>
    Object.prototype.hasOwnProperty.call(map, key) ? map[key] : full,
  );
}

export function openingSlotsFromSaved(
  template:
    | {
        bodyVars?: string[] | null;
        greetingVar?: string;
        body?: string;
      }
    | null
    | undefined,
  count = 2,
) {
  const fromVars = Array.isArray(template?.bodyVars)
    ? template.bodyVars.map((item) => flattenTemplateLine(item))
    : [];
  const fallback = [
    `{{${normalizeGreetingVar(template?.greetingVar)}}}`,
    flattenTemplateLine(template?.body || ""),
  ];
  const base = fromVars.length ? fromVars : fallback;
  const next = base.slice(0, Math.max(count, 0));
  while (next.length < count) next.push("");
  return next;
}

export function guestTemplateVars(
  guest: Guest | undefined,
  event: EventItem | undefined,
  plannerName = "Planner",
) {
  if (!guest || !event) return {} as Record<string, string>;
  const nombreCompleto = guest.rep;
  const nombre = nombreCompleto.split(" ")[0] ?? nombreCompleto;
  const planner = plannerName.split(" ")[0] || plannerName;
  const extras: Record<string, string> = {};
  if (guest.customData && typeof guest.customData === "object") {
    for (const [key, value] of Object.entries(guest.customData)) {
      if (!/^\w+$/.test(key) || isTemplateVariable(key)) continue;
      extras[key] = String(value ?? "");
    }
  }
  return {
    nombre,
    nombre_completo: nombreCompleto,
    numero_invitados: String(guest.invited),
    numero_confirmados: String(guest.confirmed),
    confirmados: String(guest.confirmed),
    mesa: guest.table || "",
    familia: guest.family || "",
    tipo: guest.guestType || "",
    notas: guest.notes || "",
    etiqueta: guest.tag || "",
    evento: event.name,
    fecha: formatDate(event.date),
    lugar: event.venue,
    direccion: event.address || "",
    hora: event.time,
    planner,
    ...extras,
  };
}

export function interpolateTemplate(
  body: string,
  guest: Guest | undefined,
  event: EventItem | undefined,
  plannerName = "Planner",
) {
  const vars = guestTemplateVars(guest, event, plannerName);
  return String(body || "").replace(
    /\{\{(\w+)\}\}/g,
    (_, key: string) => vars[key] ?? `{{${key}}}`,
  );
}
