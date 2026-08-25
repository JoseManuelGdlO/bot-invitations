import { Event } from "../models/index.js";
import { wcClient } from "./wc.client.js";
import { runWithWcToken } from "./wc-auth.js";
import { resolveActiveWhatsappConnectByOwner } from "./integration-resolver.service.js";
import { httpError } from "../utils/http-error.js";

export class WhatsAppConnectProvider {
  async sendMessage(to, text, meta = {}) {
    const eventId = meta.eventId;
    if (!eventId) throw httpError(400, "Falta eventId para enviar por WhatsApp.");
    const event = await Event.findByPk(eventId);
    if (!event) throw httpError(400, "Evento no encontrado para el envío de WhatsApp.");
    const { credentials } = await resolveActiveWhatsappConnectByOwner({ ownerUserId: event.ownerId });
    const payload = await runWithWcToken(() =>
      wcClient.sendMessageWithRetry({
        deviceId: credentials.deviceId,
        to,
        type: "text",
        text,
        tenantId: credentials.tenantId,
      }),
    );
    return {
      provider: "whatsapp-connect",
      providerId: payload?.id || payload?.messageId || payload?.wamid || null,
      to,
      skipped: false,
    };
  }
}

export function createWhatsAppProvider() {
  return new WhatsAppConnectProvider();
}
