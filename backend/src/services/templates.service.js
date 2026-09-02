import { Template } from "../models/index.js";
import { applyTemplate, eventGuestVars, flattenTemplateLine, normalizeGreetingVar } from "../utils/defaults.js";
import { fillMetaTemplate, metaClient } from "./meta.client.js";
import { resolveActiveWhatsappMetaByOwner } from "./whatsapp-meta.service.js";

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
  const copy = flattenTemplateLine(param2);
  return `¡Hola, buen día! ${greeting}\nNos comunicamos de ${copy}\nMuchas gracias.`;
}

function parseBodyVars(value) {
  if (Array.isArray(value)) return value.map((item) => flattenTemplateLine(item));
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item) => flattenTemplateLine(item));
    } catch {
      return null;
    }
  }
  return null;
}

export function openingSlotsFromTemplate(tpl, openingMessage) {
  const fromJson = parseBodyVars(tpl?.bodyVars);
  if (fromJson?.length) return fromJson;
  const greetingKey = normalizeGreetingVar(tpl?.greetingVar);
  const rawBody = tpl?.body || openingMessage || FALLBACK_OPENING;
  return [`{{${greetingKey}}}`, flattenTemplateLine(rawBody)];
}

export function projectOpeningDualWrite(slots) {
  const list = Array.isArray(slots) ? slots.map((item) => flattenTemplateLine(item)) : [];
  const first = String(list[0] || "").trim();
  const match = first.match(/^\{\{(\w+)\}\}$/);
  const greetingVar = match ? normalizeGreetingVar(match[1]) : "nombre";
  const body = list.length >= 2 ? list[1] : "";
  return { bodyVars: list, greetingVar, body };
}

export function normalizeOpeningSlots(input = {}) {
  const fromJson = parseBodyVars(input.bodyVars);
  if (fromJson?.length) return projectOpeningDualWrite(fromJson);
  const greetingVar = normalizeGreetingVar(input.greetingVar);
  const body = flattenTemplateLine(input.body || "");
  return {
    bodyVars: [`{{${greetingVar}}}`, body],
    greetingVar,
    body,
  };
}

function composeFromMetaTemplate(metaTemplate, params) {
  const bodyText = metaTemplate?.body?.text;
  if (!bodyText) return null;
  const keys = (metaTemplate.body.parameters || []).map((p) => p.key);
  let text = fillMetaTemplate(bodyText, params, keys);
  const footer = String(metaTemplate.footer?.text || "").trim();
  if (footer) text = `${text}\n${footer}`;
  return text;
}

async function loadOpeningMetaTemplate(event, tpl) {
  const ownerId = event?.ownerId;
  if (!ownerId) return null;
  const { credentials } = await resolveActiveWhatsappMetaByOwner(ownerId);
  return metaClient.getMessageTemplate({
    accessToken: credentials.accessToken,
    wabaId: credentials.wabaId,
    document: Boolean(tpl?.attachDocument),
  });
}

export async function resolveOpeningParts(tpl, event, guest, plannerName = "", openingMessage) {
  const vars = eventGuestVars(event, guest, plannerName);
  const slots = openingSlotsFromTemplate(tpl, openingMessage);
  const params = slots.map((slot) => flattenTemplateLine(applyTemplate(slot, vars)));
  if (!params[0]) params[0] = flattenTemplateLine(vars.nombre) || "invitado";
  const param1 = params[0] || "invitado";
  const param2 = params[1] || "";

  let text = composeConstructorMessage(param1, param2);
  try {
    const metaTemplate = await loadOpeningMetaTemplate(event, tpl);
    const composed = composeFromMetaTemplate(metaTemplate, params);
    if (composed) text = composed;
  } catch {
    // Sin credenciales o Graph caído: el shell local sigue siendo el texto del chat.
  }

  return {
    params,
    param1,
    param2,
    text,
  };
}

export async function resolveOpeningText(event, guest, plannerName, openingMessage) {
  const tpl = await findTemplate(event.id, { category: "Primer contacto" });
  return (await resolveOpeningParts(tpl, event, guest, plannerName, openingMessage)).text;
}

export async function resolveReminderText(event, guest, plannerName) {
  const tpl = await findTemplate(event.id, { category: "Recordatorio" });
  return renderTemplate(tpl?.body || FALLBACK_REMINDER, event, guest, plannerName);
}

export async function resolveSeguimientoText(event, guest, plannerName) {
  const tpl = await findTemplate(event.id, { category: "Seguimiento" });
  return renderTemplate(tpl?.body || FALLBACK_SEGUIMIENTO, event, guest, plannerName);
}
