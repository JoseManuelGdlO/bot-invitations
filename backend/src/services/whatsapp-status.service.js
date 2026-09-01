import { Conversation, Guest, Message } from "../models/index.js";
import { Logger } from "../utils/logger.js";

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

function canAdvanceWhatsapp(current, next) {
  if (!next) return false;
  if (current === "respondido") return false;
  return (WHATSAPP_RANK[next] || 0) > (WHATSAPP_RANK[current] || 0);
}

async function revertFailedCampaignGuest(guest) {
  if (guest.whatsapp === "respondido" || guest.lastReply) return false;
  if (guest.status !== "enviado") return false;
  guest.status = "sin_contactar";
  guest.whatsapp = "pendiente";
  guest.contactedAt = null;
  await guest.save();
  return true;
}

export async function applyWhatsappDeliveryStatus(status = {}) {
  const messageId = String(status.messageId || "").trim();
  const delivery = String(status.status || "").toLowerCase();
  if (!messageId || !delivery) {
    return { processed: true, reason: "invalid_status" };
  }

  const message = await Message.findOne({ where: { providerId: messageId } });
  if (!message) return { processed: true, reason: "unknown_message" };

  const conversation = await Conversation.findByPk(message.conversationId);
  if (!conversation) return { processed: true, reason: "unknown_conversation" };

  const guest = await Guest.findByPk(conversation.guestId);
  if (!guest) return { processed: true, reason: "unknown_guest" };

  if (delivery === "failed") {
    const reverted = await revertFailedCampaignGuest(guest);
    log.info("status failed", {
      messageId,
      guestId: guest.id,
      reverted,
    });
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
