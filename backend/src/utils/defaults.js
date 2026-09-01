import { DEFAULT_FOLLOW_UPS } from "../services/follow-up.service.js";

export const DEFAULT_ROLES = [
  { role: "Administrador", perms: ["Crear eventos", "Editar todo", "Gestionar equipo", "Exportar datos"] },
  { role: "Wedding Planner", perms: ["Editar evento", "Configurar asistente", "Responder conversaciones", "Exportar datos"] },
  { role: "Coordinador", perms: ["Ver invitados", "Responder conversaciones", "Registrar confirmaciones"] },
  { role: "Asistente", perms: ["Ver invitados", "Ver conversaciones"] },
];

/** Fuente de verdad de reglas de conversación. `technical` no se expone para editar/borrar en la UI. */
export const DEFAULT_AI_RULE_DEFS = [
  { text: "Nunca mencionar que eres una IA.", technical: false },
  { text: "Siempre ser amable y cálida.", technical: false },
  { text: "Nunca presionar al invitado.", technical: false },
  { text: "El primer mensaje ya se envió; no reenvíes la invitación.", technical: true },
  { text: "Clasifica cada mensaje en faq, asistira, no_asistira, seguimiento o desconocido.", technical: true },
  { text: "Si es FAQ, responde solo con las FAQs o plantillas de información; si no hay dato, no inventes y ofrece pasar al equipo.", technical: true },
  { text: "Si confirma o decline con claridad, usa actualizar_confirmacion y escribe el cierre en reply; no uses plantilla de Confirmación ni Rechazo.", technical: true },
  { text: "Si está indeciso, marca seguimiento; el sistema recontacta según las reglas de seguimiento.", technical: true },
  { text: "Si es desconocido, interpreta y responde; no cierres el RSVP.", technical: true },
  { text: "Si confirma pero no dice con cuántas personas, pregunta el número antes de cerrar.", technical: false },
  { text: "No superar el número máximo de invitados de la invitación.", technical: false },
  { text: "Si existe una situación especial, escalar al Wedding Planner.", technical: false },
];

export const DEFAULT_AI_TONE = {
  tone: "Elegante",
  formality: 60,
  emojis: "algunos",
  length: "normales",
};

export function defaultConversationRules() {
  return DEFAULT_AI_RULE_DEFS.map((rule) => rule.text);
}

export function technicalConversationRules() {
  return DEFAULT_AI_RULE_DEFS.filter((rule) => rule.technical).map((rule) => rule.text);
}

const RETIRED_TECHNICAL_RULES = new Set([
  "Si confirma o decline con claridad, usa las tools y la plantilla; no parafrasees el cierre.",
]);

/** Asegura que las reglas técnicas del sistema no se puedan quitar vía PATCH. */
export function mergeConversationRules(incoming) {
  const list = Array.isArray(incoming) ? incoming.map((rule) => String(rule || "").trim()).filter(Boolean) : [];
  const technical = technicalConversationRules();
  const techSet = new Set(technical);
  const withoutTech = list.filter((rule) => !techSet.has(rule) && !RETIRED_TECHNICAL_RULES.has(rule));
  // Conserva el orden de las técnicas en su posición canónica relativa al final del bloque soft/custom.
  const softDefaults = DEFAULT_AI_RULE_DEFS.filter((rule) => !rule.technical).map((rule) => rule.text);
  const softSet = new Set(softDefaults);
  const softPresent = softDefaults.filter((rule) => withoutTech.includes(rule));
  const custom = withoutTech.filter((rule) => !softSet.has(rule));
  return [...softPresent, ...technical, ...custom];
}

export function aiConfigDefaultsSnapshot() {
  return {
    ...DEFAULT_AI_TONE,
    prompt: "",
    rules: DEFAULT_AI_RULE_DEFS.map((rule) => ({
      text: rule.text,
      technical: rule.technical,
    })),
  };
}

export function defaultAI(assistant, hosts) {
  return {
    assistantName: assistant,
    ...DEFAULT_AI_TONE,
    openingMessage: `Hola {{nombre}} 👋\n\nSoy ${assistant}, asistente del equipo de ${hosts}.\n\nEstamos confirmando los invitados para {{evento}} del próximo {{fecha}} en {{lugar}}.\n\nTenemos registrada una invitación para {{numero_invitados}} personas.\n\n¿Nos podrías confirmar si podrán acompañarnos?`,
    rules: defaultConversationRules(),
    followUps: DEFAULT_FOLLOW_UPS.map((rule) => ({ ...rule })),
  };
}

export function flattenTemplateLine(value) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function normalizeGreetingVar(value) {
  const key = String(value || "").trim();
  return Object.prototype.hasOwnProperty.call(eventGuestVars({}, {}, ""), key) ? key : "nombre";
}

export function defaultTemplates(hosts) {
  return [
    { category: "Primer contacto", title: "Invitación inicial", greetingVar: "nombre", body: `${hosts}. Estamos confirmando asistencia para {{evento}} el {{fecha}}. ¿Podrán acompañarnos?` },
    { category: "Recordatorio", title: "Recordatorio amable", body: "Hola {{nombre}}, ¿pudiste revisar la invitación? Nos encantaría contar contigo el {{fecha}} ✨" },
    { category: "Seguimiento", title: "Recontacto a indecisos", body: "Hola {{nombre}}, te escribo de nuevo por {{evento}} del {{fecha}}. ¿Ya pudieron confirmar si nos acompañan?"},
  ];
}

export function defaultFaqs(venue) {
  return [
    { q: "¿Dónde es la boda?", a: `${venue}.` },
    { q: "¿Pueden ir niños?", a: "El evento está planeado únicamente para adultos." },
    { q: "¿Cuál es el código de vestimenta?", a: "Formal." },
    { q: "¿Hay estacionamiento?", a: "Sí, contamos con valet parking sin costo." },
  ];
}

export function applyTemplate(text, vars) {
  return String(text || "").replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export function eventGuestVars(event, guest, plannerName = "") {
  const nombreCompleto = String(guest?.rep || "").trim();
  const nombre = nombreCompleto.split(" ")[0] || nombreCompleto;
  const confirmados = String(guest?.confirmed ?? "");
  return {
    nombre,
    nombre_completo: nombreCompleto,
    numero_invitados: String(guest?.invited ?? ""),
    numero_confirmados: confirmados,
    confirmados,
    mesa: String(guest?.table || ""),
    evento: event?.name || "",
    fecha: event?.date || "",
    lugar: event?.venue || "",
    direccion: event?.address || "",
    hora: event?.time || "",
    planner: plannerName || "",
  };
}
