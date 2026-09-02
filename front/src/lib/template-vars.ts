import { formatDate } from "@/lib/mock/format";
import type { EventItem, Guest } from "@/lib/mock/types";

export const TEMPLATE_VARIABLES = [
  "nombre",
  "nombre_completo",
  "numero_invitados",
  "numero_confirmados",
  "mesa",
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

export function interpolateTemplate(
  body: string,
  guest: Guest | undefined,
  event: EventItem | undefined,
  plannerName = "Planner",
) {
  if (!guest || !event) return "";
  const nombreCompleto = guest.rep;
  const nombre = nombreCompleto.split(" ")[0] ?? nombreCompleto;
  const planner = plannerName.split(" ")[0] || plannerName;
  return body
    .replace(/{{nombre_completo}}/g, nombreCompleto)
    .replace(/{{nombre}}/g, nombre)
    .replace(/{{numero_invitados}}/g, String(guest.invited))
    .replace(/{{numero_confirmados}}/g, String(guest.confirmed))
    .replace(/{{confirmados}}/g, String(guest.confirmed))
    .replace(/{{mesa}}/g, guest.table || "")
    .replace(/{{evento}}/g, event.name)
    .replace(/{{fecha}}/g, formatDate(event.date))
    .replace(/{{lugar}}/g, event.venue)
    .replace(/{{direccion}}/g, event.address || "")
    .replace(/{{hora}}/g, event.time)
    .replace(/{{planner}}/g, planner);
}
