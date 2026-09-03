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

export function normalizeTemplateMultiline(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ");
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

export function faqPackForType(type) {
  const key = String(type || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  if (key === "boda") return "boda";
  if (key === "xv anos" || key === "cumpleanos" || key === "aniversario") return "cumpleanos";
  if (key === "corporativo") return "corporativo";
  return "general";
}

export function defaultFaqs(venue, type) {
  const place = String(venue || "").trim();
  const packs = {
    boda: [
      { q: "¿Cuál es la ubicación del evento?", a: `La cita es en ${place}. Te recomendamos llegar 15 minutos antes de la ceremonia.` },
      { q: "¿Cuál es el código de vestimenta?", a: "Se recomienda etiqueta / Formal. Agradecemos reservar los tonos blancos para la novia." },
      { q: "¿Tienen mesa de regalos?", a: "Tu presencia es nuestro mejor obsequio. Si deseas tener un detalle, consulta con los anfitriones sobre la mesa de regalos o el sobre de felicitación." },
      { q: "¿Puedo asistir con niños?", a: "Nos encantaría recibirlos, pero este evento está pensado exclusivamente para adultos. ¡Agradecemos tu comprensión!" },
      { q: "¿El lugar cuenta con estacionamiento?", a: "Sí, el recinto cuenta con área de estacionamiento / servicio de valet parking." },
    ],
    cumpleanos: [
      { q: "¿Cuál es la ubicación?", a: `La recepción se llevará a cabo en ${place}.` },
      { q: "¿Cuál es el código de vestimenta?", a: "Recomendamos vestir de Formal / Semiformal. ¡Ven con ganas de bailar!" },
      { q: "¿Habrá estacionamiento?", a: "Sí, el salón dispone de área de estacionamiento para invitados." },
    ],
    corporativo: [
      { q: "¿Dónde se realizará el evento y cuál es el horario?", a: `Tendrá lugar en ${place}. El registro comienza puntual a la hora indicada.` },
      { q: "¿Cuál es el código de vestimenta?", a: "Business casual / Formal de negocios." },
      { q: "¿El evento incluye alimentos o catering?", a: "Sí, contaremos con servicio de coffee break y alimentos durante la jornada." },
      { q: "¿Hay estacionamiento disponible?", a: "Sí, contamos con cajones de estacionamiento asignados dentro del recinto." },
      { q: "¿Cómo valido mi acceso al llegar?", a: "Basta con presentar tu confirmación digital o identificación oficial en el módulo de recepción." },
    ],
    general: [
      { q: "¿Cuál es la ubicación?", a: `El evento se llevará a cabo en ${place}.` },
      { q: "¿Cuál es el código de vestimenta?", a: "Formal / Semiformal." },
      { q: "¿El lugar cuenta con estacionamiento?", a: "Sí, el recinto dispone de estacionamiento para los asistentes." },
      { q: "¿Puedo llevar acompañantes?", a: "Los accesos son únicamente los especificados en tu mensaje de invitación." },
    ],
  };
  return packs[faqPackForType(type)] || packs.general;
}

export function applyTemplate(text, vars) {
  return String(text || "").replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export function eventGuestVars(event, guest, plannerName = "") {
  const nombreCompleto = String(guest?.rep || "").trim();
  const nombre = nombreCompleto.split(" ")[0] || nombreCompleto;
  const confirmados = String(guest?.confirmed ?? "");
  const extras = {};
  const raw = guest?.customData;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      if (!/^\w+$/.test(key)) continue;
      if (
        [
          "nombre",
          "nombre_completo",
          "numero_invitados",
          "numero_confirmados",
          "confirmados",
          "mesa",
          "evento",
          "fecha",
          "lugar",
          "direccion",
          "hora",
          "planner",
          "familia",
          "tipo",
          "notas",
          "etiqueta",
        ].includes(key)
      ) {
        continue;
      }
      extras[key] = String(value ?? "");
    }
  }
  return {
    nombre,
    nombre_completo: nombreCompleto,
    numero_invitados: String(guest?.invited ?? ""),
    numero_confirmados: confirmados,
    confirmados,
    mesa: String(guest?.table || ""),
    familia: String(guest?.family || ""),
    tipo: String(guest?.guestType || ""),
    notas: String(guest?.notes || ""),
    etiqueta: String(guest?.tag || ""),
    evento: event?.name || "",
    fecha: event?.date || "",
    lugar: event?.venue || "",
    direccion: event?.address || "",
    hora: event?.time || "",
    planner: plannerName || "",
    ...extras,
  };
}
