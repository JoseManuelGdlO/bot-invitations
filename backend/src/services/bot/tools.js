import { logActivity } from "../activity.service.js";

export const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
  },
  required: ["reply"],
  additionalProperties: false,
};

export const BOT_TOOLS = [
  {
    type: "function",
    name: "actualizar_confirmacion",
    description:
      "Actualiza el RSVP del invitado actual. Úsala cuando el invitado confirme, asista con menos personas o decline.",
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
];

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

export async function executeActualizarConfirmacion(args, { guest, event }) {
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
  await guest.save();

  if (status === "confirmado" || status === "parcial") {
    await logActivity(event.id, `${guest.rep} confirmó ${confirmed} de ${guest.invited} lugares`, "confirm");
  } else {
    await logActivity(event.id, `${guest.rep} no podrá asistir`, "reject");
  }

  return {
    success: true,
    status,
    confirmed,
    invited: guest.invited,
    instruction: "Responde ahora con el JSON final usando la plantilla de confirmación o rechazo de este evento.",
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
  return { error: `Función ${name || "desconocida"} no implementada.` };
}
