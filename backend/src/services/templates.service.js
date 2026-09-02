import { Template } from "../models/index.js";
import { applyTemplate, eventGuestVars, flattenTemplateLine, normalizeGreetingVar, normalizeTemplateMultiline } from "../utils/defaults.js";

export const FALLBACK_OPENING = "Hola {{nombre}}, ¿podrán acompañarnos?";
export const FALLBACK_REMINDER =
  "Hola {{nombre}}, ¿pudiste revisar la invitación? Nos encantaría contar contigo el {{fecha}}.";
export const FALLBACK_SEGUIMIENTO =
  "Hola {{nombre}}, te escribo de nuevo por {{evento}} del {{fecha}}. ¿Ya pudieron confirmar si nos acompañan?";

export async function findTemplate(eventId, { category, id } = {}) {
  const templateId = String(id || "").trim();
  if (templateId) {
    const byId = await Template.findOne({ where: { id: templateId, eventId } });
    if (byId) return byId;
  }
  const cat = String(category || "").trim();
  if (!cat) return null;
  return Template.findOne({
    where: { eventId, category: cat },
    order: [["createdAt", "ASC"]],
  });
}

export function renderTemplate(templateOrBody, event, guest, plannerName = "") {
  const body = typeof templateOrBody === "string" ? templateOrBody : templateOrBody?.body || "";
  return applyTemplate(body, eventGuestVars(event, guest, plannerName));
}

export function composeConstructorMessage(param1, param2) {
  const greeting = flattenTemplateLine(param1) || "invitado";
  const copy = normalizeTemplateMultiline(param2);
  return `¡Hola, buen día! ${greeting}\nNos comunicamos de ${copy}\nMuchas gracias.`;
}

export function resolveOpeningParts(tpl, event, guest, plannerName = "", openingMessage) {
  const vars = eventGuestVars(event, guest, plannerName);
  const greetingKey = normalizeGreetingVar(tpl?.greetingVar);
  const param1 = flattenTemplateLine(vars[greetingKey]) || "invitado";
  const rawBody = tpl?.body || openingMessage || FALLBACK_OPENING;
  const param2 = normalizeTemplateMultiline(renderTemplate(rawBody, event, guest, plannerName));
  return {
    param1,
    param2,
    text: composeConstructorMessage(param1, param2),
  };
}

export async function resolveOpeningText(event, guest, plannerName, openingMessage) {
  const tpl = await findTemplate(event.id, { category: "Primer contacto" });
  return resolveOpeningParts(tpl, event, guest, plannerName, openingMessage).text;
}

export async function resolveReminderText(event, guest, plannerName) {
  const tpl = await findTemplate(event.id, { category: "Recordatorio" });
  return renderTemplate(tpl?.body || FALLBACK_REMINDER, event, guest, plannerName);
}

export async function resolveSeguimientoText(event, guest, plannerName) {
  const tpl = await findTemplate(event.id, { category: "Seguimiento" });
  return renderTemplate(tpl?.body || FALLBACK_SEGUIMIENTO, event, guest, plannerName);
}
