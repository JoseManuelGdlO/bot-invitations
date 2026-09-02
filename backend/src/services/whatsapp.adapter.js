import { Conversation, Event, Guest, Message } from "../models/index.js";
import { httpError } from "../utils/http-error.js";
import { eventGuestVars } from "../utils/defaults.js";
import { formatWhatsappGraphTo } from "../utils/whatsapp-identity.js";
import { metaClient, sanitizeMetaBodyParam } from "./meta.client.js";
import { resolveActiveWhatsappMetaByOwner } from "./whatsapp-meta.service.js";

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

    const phone = formatWhatsappGraphTo(to);
    if (!phone) throw httpError(400, "Teléfono de WhatsApp inválido.");

    const body = String(text || "").trim();
    const guest = meta.guestId ? await Guest.findByPk(meta.guestId) : null;
    const cold = guest?.status === "sin_contactar" || (await isColdConversation(meta.guestId));

    const { credentials } = await resolveActiveWhatsappMetaByOwner(event.ownerId);

    let payload;
    if (cold) {
      const fromJob = Array.isArray(meta.hsmParams)
        ? meta.hsmParams.map((value) => sanitizeMetaBodyParam(value)).filter(Boolean)
        : [];
      const nombre = sanitizeMetaBodyParam(eventGuestVars(event, guest).nombre) || "invitado";
      const bodyParam = sanitizeMetaBodyParam(body);
      const bodyParams = fromJob.length >= 2 ? fromJob.slice(0, 2) : [nombre, bodyParam];
      if (!bodyParams[1]) throw httpError(400, "El mensaje de plantilla no puede estar vacío.");
      payload = await metaClient.sendTemplateWithRetry({
        to: phone,
        bodyParams,
        accessToken: credentials.accessToken,
        phoneNumberId: credentials.phoneNumberId,
        ...(meta.hsmTemplateName ? { templateName: meta.hsmTemplateName } : {}),
        ...(meta.hsmHeaderDocument ? { headerDocument: meta.hsmHeaderDocument } : {}),
      });
    } else {
      if (!body) throw httpError(400, "text is required when type=text");
      payload = await metaClient.sendTextWithRetry({
        to: phone,
        text: body,
        accessToken: credentials.accessToken,
        phoneNumberId: credentials.phoneNumberId,
      });
    }

    return {
      provider: "meta-cloud",
      providerId: payload?.messages?.[0]?.id || payload?.id || payload?.wamid || null,
      to: phone,
      skipped: false,
      conversationStarted: cold,
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
