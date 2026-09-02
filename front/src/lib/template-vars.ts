import { formatDate } from "@/lib/mock/format";
import type { EventItem, Guest } from "@/lib/mock/types";

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

export function normalizeGreetingVar(
  value: string | null | undefined,
): TemplateVariable {
  const key = String(value || "").trim();
  return isTemplateVariable(key) ? key : "nombre";
}

export function composeConstructorTemplate(
  greetingVar: string,
  body: string,
) {
  const key = normalizeGreetingVar(greetingVar);
  return `¡Hola, buen día! {{${key}}}\nNos comunicamos de ${body}\nMuchas gracias.`;
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
