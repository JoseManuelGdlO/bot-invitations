import { logActivity } from "../activity.service.js";
import { botLog } from "./bot-logger.js";
import {
  defaultIndecisoFollowUpDate,
  formatFollowUpDate,
  INDECISO_NUDGE_ID,
  indecisoFollowUpDays,
  parseFollowUpDateInput,
} from "../follow-up.service.js";

export const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    intent: {
      type: "string",
      enum: ["faq", "asistira", "no_asistira", "seguimiento", "desconocido"],
      description: "Clasificación principal del mensaje del invitado.",
    },
  },
  required: ["reply", "intent"],
  additionalProperties: false,
};

export const INTENT_LABELS = {
  faq: "FAQ",
  asistira: "Asistirá",
  no_asistira: "No asistirá",
  seguimiento: "Seguimiento",
  desconocido: "Desconocido",
};

export const BOT_TOOLS = [
  {
    type: "function",
    name: "actualizar_confirmacion",
    description:
      "Actualiza el RSVP del invitado actual. Úsala cuando el invitado confirme, asista con menos personas, decline, o pida más personas que el cupo (el sistema recorta confirmed al cupo; no dejes de llamarla para preguntar).",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["confirmado", "parcial", "no_asistira"],
          description: "Estado final de asistencia.",
        },
        confirmed: {
          type: ["number", "null"],
          description: "Personas que asistirán. Null si no asisten.",
        },
      },
      required: ["status", "confirmed"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "marcar_seguimiento",
    description:
      "Marca al invitado como seguimiento cuando la respuesta es ambigua o pospone la confirmación (por ejemplo: luego te digo, creo que sí, lo hablo con mi pareja). El sistema agenda un recontacto según las reglas de seguimiento del evento. No la uses si confirma o decline con claridad.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: ["string", "null"],
          description: "Por qué queda pendiente.",
        },
        followUpDate: {
          type: ["string", "null"],
          description: "Fecha de recontacto YYYY-MM-DD o DD/MM/YYYY. Null para agendar según las reglas de seguimiento del evento.",
        },
      },
      required: ["reason", "followUpDate"],
      additionalProperties: false,
    },
    strict: true,
  },
];

const TOOL_ORDER = {
  actualizar_confirmacion: 0,
  marcar_seguimiento: 1,
};

export function sortFunctionCalls(calls) {
  return [...calls].sort((a, b) => (TOOL_ORDER[a.name] ?? 9) - (TOOL_ORDER[b.name] ?? 9));
}

function clampConfirmed(guest, status, raw) {
  const invited = Math.max(0, Number(guest.invited) || 0);
  if (status === "no_asistira") return 0;
  const n = raw == null || raw === "" ? NaN : Number(raw);
  if (status === "confirmado") {
    if (!Number.isFinite(n) || n <= 0) return invited;
    return Math.min(invited, Math.max(0, Math.round(n)));
  }
  if (!Number.isFinite(n) || n <= 0) return Math.max(1, Math.min(invited, invited - 1 || 1));
  return Math.min(invited, Math.max(0, Math.round(n)));
}

export async function executeActualizarConfirmacion(args, { guest, event, dryRun = false }) {
  const status = String(args?.status || "");
  if (!["confirmado", "parcial", "no_asistira"].includes(status)) {
    return { success: false, error: "status inválido" };
  }
  const confirmed = clampConfirmed(guest, status, args?.confirmed);
  const rsvpChanged = guest.status !== status || Number(guest.confirmed) !== confirmed;
  guest.status = status;
  guest.confirmed = confirmed;
  guest.whatsapp = "respondido";
  if (["confirmado", "parcial"].includes(status) && !guest.confirmedAt) {
    guest.confirmedAt = new Date();
  }
  if (status === "no_asistira") {
    guest.confirmedAt = guest.confirmedAt || new Date();
  }
  if (!dryRun) {
    await guest.save();

    if (rsvpChanged) {
      if (status === "confirmado" || status === "parcial") {
        await logActivity(event.id, `${guest.rep} confirmó ${confirmed} de ${guest.invited} lugares`, "confirm");
      } else {
        await logActivity(event.id, `${guest.rep} no podrá asistir`, "reject");
      }
    }
  }

  botLog("RSVP actualizado", {
    guestId: guest.id,
    status,
    confirmed,
    invited: guest.invited,
    dryRun,
  });
  const closeHint =
    status === "no_asistira"
      ? "Escribe el cierre en reply. Si las reglas de conversación indican cómo redactar el aviso, síguelas. Si no, cierre breve y natural (tono del cerebro). Agradece el aviso. En este turno no se llama a usar_plantilla."
      : `Escribe el cierre en reply. La ventana de 24 horas está abierta: es un mensaje normal. Si las reglas de conversación indican cómo redactar el cierre, síguelas. Si no, cierre breve y natural: escribe un mensaje genérico de confirmación de asistencia y menciona que confirmamos ${confirmed} persona(s) (cupo ${guest.invited}). Si el sistema recortó al cupo, explica que no hay lugares extra y que avisen al equipo. En este turno no se llama a usar_plantilla.`;
  return {
    success: true,
    status,
    confirmed,
    invited: guest.invited,
    instruction: closeHint,
  };
}

export async function executeMarcarSeguimiento(args, { guest, event, ai, dryRun = false }) {
  if (["confirmado", "parcial", "no_asistira"].includes(guest.status)) {
    return { success: false, error: "El invitado ya tiene un RSVP cerrado." };
  }
  const enteredFollowUp = guest.status !== "seguimiento";
  guest.status = "seguimiento";
  guest.whatsapp = "respondido";
  const given = parseFollowUpDateInput(args?.followUpDate);
  const due = given || defaultIndecisoFollowUpDate(new Date(), indecisoFollowUpDays(ai?.followUps));
  guest.followUp = formatFollowUpDate(due);
  const sent = Array.isArray(guest.followUpsSent) ? guest.followUpsSent.filter((id) => id !== INDECISO_NUDGE_ID) : [];
  guest.followUpsSent = sent;
  if (typeof guest.changed === "function") guest.changed("followUpsSent", true);
  if (!dryRun) {
    await guest.save();
    if (enteredFollowUp) {
      const reason = String(args?.reason || "").trim();
      await logActivity(
        event.id,
        `${guest.rep} quedó en seguimiento${reason ? `: ${reason}` : ""}`,
        "system",
      );
    }
  }
  botLog("seguimiento marcado", {
    guestId: guest.id,
    followUp: guest.followUp || "",
    reason: args?.reason || null,
    dryRun,
  });
  return {
    success: true,
    status: "seguimiento",
    followUp: guest.followUp || "",
    instruction:
      "Responde breve que les escribes de nuevo más adelante. No insistas en un sí o un no.",
  };
}

function liveTurnTemplateRefusal() {
  return {
    success: false,
    error:
      "La ventana de 24 horas está abierta. En este turno no se llama a usar_plantilla. Escribe en reply un mensaje genérico de confirmación de asistencia, o responde la duda con los datos del evento y las preguntas frecuentes. No envíes Primer contacto, Recordatorio ni Seguimiento.",
  };
}

export async function executeUsarPlantilla() {
  return liveTurnTemplateRefusal();
}

export async function executeBotTool(functionCall, ctx) {
  const name = functionCall?.name;
  let args = {};
  try {
    args = JSON.parse(functionCall.arguments || "{}");
  } catch {
    args = {};
  }
  if (name === "actualizar_confirmacion") {
    return executeActualizarConfirmacion(args, ctx);
  }
  if (name === "marcar_seguimiento") {
    return executeMarcarSeguimiento(args, ctx);
  }
  if (name === "usar_plantilla") {
    return executeUsarPlantilla(args, ctx);
  }
  return { error: `Función ${name || "desconocida"} no implementada.` };
}
