import { Conversation, Event, Guest, Message } from "../models/index.js";
import { httpError } from "../utils/http-error.js";
import { eventGuestVars } from "../utils/defaults.js";
import { normalizeWaIdTo10 } from "../utils/whatsapp-identity.js";
import { metaClient, sanitizeMetaBodyParam } from "./meta.client.js";

const CUSTOMER_CARE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function isColdConversation(guestId, now = Date.now()) {
  if (!guestId) return true;
  const conv = await Conversation.findOne({ where: { guestId } });
  if (!conv) return true;
  const last = await Message.findOne({
    where: { conversationId: conv.id, from: "guest" },
    order: [["createdAt", "DESC"]],
  });
  if (!last?.createdAt) return true;
  return now - new Date(last.createdAt).getTime() > CUSTOMER_CARE_WINDOW_MS;
}

export class MetaCloudProvider {
  async sendMessage(to, text, meta = {}) {
    const eventId = meta.eventId;
    if (!eventId) throw httpError(400, "Falta eventId para enviar por WhatsApp.");
    const event = await Event.findByPk(eventId);
    if (!event) throw httpError(400, "Evento no encontrado para el envío de WhatsApp.");

    const phone = normalizeWaIdTo10(to);
    if (!phone) throw httpError(400, "Teléfono de WhatsApp inválido.");

    const body = String(text || "").trim();
    const guest = meta.guestId ? await Guest.findByPk(meta.guestId) : null;
    const cold = guest?.status === "sin_contactar" || (await isColdConversation(meta.guestId));

    let payload;
    if (cold) {
      const nombre = sanitizeMetaBodyParam(eventGuestVars(event, guest).nombre) || "invitado";
      const bodyParam = sanitizeMetaBodyParam(body);
      if (!bodyParam) throw httpError(400, "El mensaje de plantilla no puede estar vacío.");
      payload = await metaClient.sendTemplateWithRetry({
        to: phone,
        bodyParams: [nombre, bodyParam],
      });
    } else {
      if (!body) throw httpError(400, "text is required when type=text");
      payload = await metaClient.sendTextWithRetry({ to: phone, text: body });
    }

    return {
      provider: "meta-cloud",
      providerId: payload?.messages?.[0]?.id || payload?.id || payload?.wamid || null,
      to: phone,
      skipped: false,
    };
  }
}

export function createWhatsAppProvider() {
  return new MetaCloudProvider();
}

/*
import { wcClient } from "./wc.client.js";
import { runWithWcToken } from "./wc-auth.js";
import { resolveActiveWhatsappConnectByOwner } from "./integration-resolver.service.js";

export class WhatsAppConnectProvider {
  async sendMessage(to, text, meta = {}) {
    const eventId = meta.eventId;
    if (!eventId) throw httpError(400, "Falta eventId para enviar por WhatsApp.");
    const event = await Event.findByPk(eventId);
    if (!event) throw httpError(400, "Evento no encontrado para el envío de WhatsApp.");
    const { credentials } = await resolveActiveWhatsappConnectByOwner({ ownerUserId: event.ownerId });
    if (!credentials.tenantId) throw httpError(400, "Falta tenantId en las credenciales de WhatsApp.");
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
*/
