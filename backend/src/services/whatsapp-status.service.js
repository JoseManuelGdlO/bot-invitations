import { Conversation, Guest, Message } from "../models/index.js";
import { Logger } from "../utils/logger.js";
import { deliveryErrorFromFailure, summarizeMetaErrors } from "../utils/meta-error.js";
import { recordTestDeliveryStatus } from "./whatsapp-test-delivery.js";
import {
  ECOSYSTEM_ENGAGEMENT_CODE,
  rescheduleEcosystemDelivery,
} from "./ecosystem-retry.service.js";

const log = new Logger("WhatsApp");

const WHATSAPP_RANK = {
  pendiente: 0,
  enviado: 1,
  entregado: 2,
  leido: 3,
  respondido: 4,
};

const STATUS_TO_WHATSAPP = {
  sent: "enviado",
  delivered: "entregado",
  read: "leido",
};

const RSVP_MARK_ENTREGADO = new Set(["enviado"]);

function isEcosystemEngagement(status) {
  const errors = summarizeMetaErrors(status?.errors);
  return Number(errors[0]?.code) === ECOSYSTEM_ENGAGEMENT_CODE;
}

function canAdvanceWhatsapp(current, next) {
  if (!next) return false;
  if (current === "respondido") return false;
  return (WHATSAPP_RANK[next] || 0) > (WHATSAPP_RANK[current] || 0);
}

async function revertFailedCampaignGuest(guest, deliveryError) {
  if (guest.whatsapp === "respondido" || guest.lastReply) return false;
  if (!["enviado", "reagendado"].includes(guest.status)) return false;
  guest.status = "sin_contactar";
  guest.whatsapp = "pendiente";
  guest.contactedAt = null;
  if (deliveryError) guest.deliveryError = deliveryError;
  await guest.save();
  return true;
}

async function persistGuestDeliveryError(guest, status, { retrying = false } = {}) {
  if (!guest) return;
  guest.deliveryError = deliveryErrorFromFailure(status, { retrying });
  await guest.save();
}

function failedMeta(status, extra = {}) {
  const errors = summarizeMetaErrors(status.errors);
  return {
    messageId: String(status.messageId || "").trim() || null,
    recipientId: status.recipientId || null,
    phoneNumberId: status.phoneNumberId || null,
    errors,
    errorCode: errors[0]?.code ?? null,
    errorTitle: errors[0]?.title || null,
    errorMessage: errors[0]?.message || null,
    errorDetails: errors[0]?.details || null,
    ...extra,
  };
}

export async function applyWhatsappDeliveryStatus(status = {}) {
  const messageId = String(status.messageId || "").trim();
  const delivery = String(status.status || "").toLowerCase();
  if (!messageId || !delivery) {
    return { processed: true, reason: "invalid_status" };
  }

  recordTestDeliveryStatus(status);

  const message = await Message.findOne({ where: { providerId: messageId } });
  if (!message) {
    if (delivery === "failed" && isEcosystemEngagement(status)) {
      const scheduled = await rescheduleEcosystemDelivery({ messageId });
      if (scheduled.ok) {
        await persistGuestDeliveryError(scheduled.guest, status, { retrying: true });
        log.error("status failed", failedMeta(status, {
          rescheduled: true,
          retryAt: scheduled.retryAt instanceof Date ? scheduled.retryAt.toISOString() : scheduled.retryAt || null,
        }));
        return { processed: true, reason: "failed_rescheduled" };
      }
    }
    if (delivery === "failed") {
      log.error("status failed: mensaje desconocido", failedMeta(status));
    }
    return { processed: true, reason: "unknown_message" };
  }

  const conversation = await Conversation.findByPk(message.conversationId);
  if (!conversation) {
    if (delivery === "failed") {
      log.error("status failed: conversación desconocida", failedMeta(status));
    }
    return { processed: true, reason: "unknown_conversation" };
  }

  const guest = await Guest.findByPk(conversation.guestId);
  if (!guest) {
    if (delivery === "failed") {
      log.error("status failed: invitado desconocido", failedMeta(status));
    }
    return { processed: true, reason: "unknown_guest" };
  }

  if (delivery === "failed") {
    if (isEcosystemEngagement(status)) {
      const scheduled = await rescheduleEcosystemDelivery({ guest, messageId });
      if (scheduled.ok) {
        await persistGuestDeliveryError(guest, status, { retrying: true });
        log.error("status failed", failedMeta(status, {
          guestId: guest.id,
          phone: guest.phone || null,
          name: guest.rep || null,
          reverted: false,
          rescheduled: true,
          retryAt: scheduled.retryAt instanceof Date ? scheduled.retryAt.toISOString() : scheduled.retryAt || null,
        }));
        return { processed: true, reason: "failed_rescheduled" };
      }
    }
    const reverted = await revertFailedCampaignGuest(guest, deliveryErrorFromFailure(status));
    log.error("status failed", failedMeta(status, {
      guestId: guest.id,
      phone: guest.phone || null,
      name: guest.rep || null,
      reverted,
    }));
    return { processed: true, reason: reverted ? "failed_reverted" : "failed" };
  }

  const nextWhatsapp = STATUS_TO_WHATSAPP[delivery];
  if (!nextWhatsapp) return { processed: true, reason: "ignored_status" };

  let changed = false;
  if (canAdvanceWhatsapp(guest.whatsapp, nextWhatsapp)) {
    guest.whatsapp = nextWhatsapp;
    changed = true;
  }
  if (
    (nextWhatsapp === "entregado" || nextWhatsapp === "leido") &&
    RSVP_MARK_ENTREGADO.has(guest.status)
  ) {
    guest.status = "entregado";
    changed = true;
  }
  if (changed) {
    await guest.save();
    log.info(`status ${delivery}`, {
      messageId,
      guestId: guest.id,
      whatsapp: guest.whatsapp,
      status: guest.status,
    });
  }
  return { processed: true, reason: `status_${delivery}` };
}
