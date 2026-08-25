import { AiConfig, Faq, Template, User } from "../../models/index.js";
import { applyTemplate, eventGuestVars } from "../../utils/defaults.js";

const EMOJI_HINT = {
  ninguno: "No uses emojis.",
  algunos: "Puedes usar pocos emojis, con discreción.",
  frecuentes: "Puedes usar emojis con naturalidad, sin saturar.",
};

const LENGTH_HINT = {
  cortos: "Responde en mensajes cortos (2 a 4 líneas).",
  normales: "Responde con longitud moderada, clara y completa.",
  detallados: "Puedes extenderte un poco si hace falta, sin enrollarte.",
};

function listRules(ai) {
  const rules = Array.isArray(ai?.rules) ? ai.rules : [];
  return rules.map((rule) => `- ${rule}`).join("\n");
}

export function defaultPrompt(ai = {}) {
  const name = ai.assistantName || "Sofía";
  const tone = ai.tone || "Elegante";
  const formality = Number.isFinite(Number(ai.formality)) ? Number(ai.formality) : 60;
  const emojis = EMOJI_HINT[ai.emojis] || EMOJI_HINT.algunos;
  const length = LENGTH_HINT[ai.length] || LENGTH_HINT.normales;
  const rules = listRules(ai) || "- Sé amable y no presiones al invitado.";

  return `Eres ${name}, asistente del equipo del evento. Hablas por WhatsApp con un invitado para confirmar asistencia.

Personalidad:
- Tono: ${tone}.
- Formalidad: ${formality}% (0 = muy cercano, 100 = muy formal).
- ${emojis}
- ${length}

Reglas de conversación:
${rules}

Nunca digas que eres una inteligencia artificial. Si falta un dato, no lo inventes: ofrece escalar al equipo.`;
}

export async function loadEventBotContext(event, guest) {
  const [ai, templates, faqs, owner] = await Promise.all([
    AiConfig.findOne({ where: { eventId: event.id } }),
    Template.findAll({ where: { eventId: event.id }, order: [["createdAt", "ASC"]] }),
    Faq.findAll({ where: { eventId: event.id }, order: [["createdAt", "ASC"]] }),
    User.findByPk(event.ownerId),
  ]);
  const plannerName = owner?.name || "";
  const vars = eventGuestVars(event, guest, plannerName);
  return { ai, templates, faqs, plannerName, vars };
}

export function buildInstructions({ event, guest, ai, templates = [], faqs = [], vars = {} }) {
  const stored = String(ai?.prompt || "").trim();
  const brain = stored || defaultPrompt(ai || {});
  const templateBlock = templates.length
    ? templates
        .map((t) => {
          const body = applyTemplate(t.body, vars);
          return `- [${t.category}] ${t.title}: ${body}`;
        })
        .join("\n")
    : "- (no hay plantillas guardadas para este evento)";
  const faqBlock = faqs.length
    ? faqs.map((f) => `- P: ${f.q}\n  R: ${f.a}`).join("\n")
    : "- (no hay FAQs guardadas para este evento)";

  return `${brain}

## Aislamiento (obligatorio, prevalece sobre lo anterior)
Eres el bot ÚNICAMENTE del evento indicado. Tienes prohibido mencionar, mezclar o inventar datos de otros eventos del mismo planner o de cualquier otro. Si el invitado pregunta algo que no está en los hechos, plantillas o FAQs de ESTE evento, dilo con honestidad y ofrece pasar el tema al equipo. No uses recuerdos de otras conversaciones ni de otros eventos.

## Evento actual
- Nombre: ${event.name}
- Anfitriones: ${event.hosts}
- Fecha: ${event.date}
- Hora: ${event.time}
- Lugar: ${event.venue}
- Dirección: ${event.address || "no indicada"}
- Tipo: ${event.type}

## Invitado actual
- Nombre: ${guest.rep}
- Cupo de la invitación: ${guest.invited}
- Confirmados hasta ahora: ${guest.confirmed}
- Estado: ${guest.status}
- Mesa: ${guest.table || "sin asignar"}
- Notas internas (no las cites literal si no aportan): ${guest.notes || "ninguna"}

## Plantillas de este evento
Úsalas como base cuando encajen (ubicación, dress code, confirmación, rechazo, recordatorio, etc.). Adáptalas al tono, no copies datos de otro evento.
${templateBlock}

## Preguntas frecuentes de este evento
${faqBlock}

Cuando el invitado confirme o decline, llama a la herramienta actualizar_confirmacion. El número confirmado nunca puede superar el cupo de la invitación.`;
}
