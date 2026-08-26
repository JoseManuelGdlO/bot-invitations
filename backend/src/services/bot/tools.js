import { logActivity } from "../activity.service.js";
import { User } from "../../models/index.js";
import { findTemplate, renderTemplate } from "../templates.service.js";
import { botLog } from "./bot-logger.js";
import {
  defaultIndecisoFollowUpDate,
  formatFollowUpDate,
  INDECISO_NUDGE_ID,
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
      "Actualiza el RSVP del invitado actual. Úsala cuando el invitado confirme, asista con menos personas o decline con claridad.",
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
      "Marca al invitado como seguimiento cuando la respuesta es ambigua o pospone la confirmación (por ejemplo: luego te digo, creo que sí, lo hablo con mi pareja). El sistema agenda un recontacto a 3 días. No la uses si confirma o decline con claridad.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: ["string", "null"],
          description: "Por qué queda pendiente.",
        },
        followUpDate: {
          type: ["string", "null"],
          description: "Fecha de recontacto YYYY-MM-DD o DD/MM/YYYY. Null para agendar a 3 días desde hoy.",
        },
      },
      required: ["reason", "followUpDate"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "usar_plantilla",
    description:
      "Envía exactamente el texto de una plantilla de la biblioteca, ya interpolado. Ese texto se manda al invitado sin reescribirlo.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: ["string", "null"],
          description: "Categoría (Primer contacto, Recordatorio, Confirmación, Rechazo, Seguimiento, Ubicación, etc.).",
        },
        id: {
          type: ["string", "null"],
          description: "Id de la plantilla si lo conoces.",
        },
      },
      required: ["category", "id"],
      additionalProperties: false,
    },
    strict: true,
  },
];

const TOOL_ORDER = {
  actualizar_confirmacion: 0,
  marcar_seguimiento: 1,
  usar_plantilla: 2,
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

    if (status === "confirmado" || status === "parcial") {
      await logActivity(event.id, `${guest.rep} confirmó ${confirmed} de ${guest.invited} lugares`, "confirm");
    } else {
      await logActivity(event.id, `${guest.rep} no podrá asistir`, "reject");
    }
  }

  const category = status === "no_asistira" ? "Rechazo" : "Confirmación";
  botLog("RSVP actualizado", {
    guestId: guest.id,
    status,
    confirmed,
    invited: guest.invited,
    dryRun,
    nextTemplate: category,
  });
  return {
    success: true,
    status,
    confirmed,
    invited: guest.invited,
    instruction: `Llama ahora a usar_plantilla con category "${category}". Ese texto se enviará tal cual.`,
  };
}

export async function executeMarcarSeguimiento(args, { guest, event, dryRun = false }) {
  if (["confirmado", "parcial", "no_asistira"].includes(guest.status)) {
    return { success: false, error: "El invitado ya tiene un RSVP cerrado." };
  }
  guest.status = "seguimiento";
  guest.whatsapp = "respondido";
  const given = parseFollowUpDateInput(args?.followUpDate);
  const due = given || defaultIndecisoFollowUpDate();
  guest.followUp = formatFollowUpDate(due);
  const sent = Array.isArray(guest.followUpsSent) ? guest.followUpsSent.filter((id) => id !== INDECISO_NUDGE_ID) : [];
  guest.followUpsSent = sent;
  if (typeof guest.changed === "function") guest.changed("followUpsSent", true);
  if (!dryRun) {
    await guest.save();
    const reason = String(args?.reason || "").trim();
    await logActivity(
      event.id,
      `${guest.rep} quedó en seguimiento${reason ? `: ${reason}` : ""}`,
      "system",
    );
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
      "Responde breve confirmando que les escribes de nuevo más adelante. No uses ahora la plantilla Seguimiento ni insistas en un sí o un no.",
  };
}

export async function executeUsarPlantilla(args, { guest, event, plannerName }) {
  const category = String(args?.category || "").trim() || null;
  const id = String(args?.id || "").trim() || null;
  if (!category && !id) {
    return { success: false, error: "Indica category o id de la plantilla." };
  }
  let name = plannerName;
  if (!name) {
    const owner = await User.findByPk(event.ownerId);
    name = owner?.name || "";
  }
  const template = await findTemplate(event.id, { category, id });
  if (!template) {
    return { success: false, error: "No hay plantilla para esos criterios." };
  }
  const text = renderTemplate(template, event, guest, name);
  if (!text.trim()) {
    return { success: false, error: "La plantilla quedó vacía." };
  }
  botLog("plantilla resuelta", {
    guestId: guest.id,
    category: template.category,
    title: template.title,
    id: template.id,
    preview: text.slice(0, 120),
  });
  return {
    success: true,
    useAsReply: true,
    text,
    category: template.category,
    title: template.title,
    id: template.id,
  };
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
