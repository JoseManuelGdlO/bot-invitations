import crypto from "crypto";
import { env } from "../config/env.js";
import { handleInboundWhatsapp } from "../controllers/bot.controller.js";
import { resolveGuestForInbound } from "./bot/bot.service.js";
import { claimInboundEvent, inboundDedupeKey } from "./inbound-dedupe.service.js";
import { resolveMetaWhatsappByPhoneNumberId } from "./integration-resolver.service.js";
import { httpError } from "../utils/http-error.js";
import { Logger } from "../utils/logger.js";

const log = new Logger("MetaWebhook");

const STATUS_TO_WHATSAPP = {
  sent: "enviado",
  delivered: "entregado",
  read: "leido",
};

export function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  const expectedSecret = String(appSecret || "").trim();
  const header = String(signatureHeader || "").trim();
  if (!expectedSecret) return { ok: false, reason: "missing_app_secret" };
  if (!header.startsWith("sha256=")) return { ok: false, reason: "missing_signature" };

  const expected = `sha256=${crypto.createHmac("sha256", expectedSecret).update(rawBody).digest("hex")}`;
  const left = Buffer.from(header);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return { ok: false, reason: "invalid_signature" };
  }
  return { ok: true };
}

export function normalizeMetaInboundMessage({ message, metadata } = {}) {
  const text = String(message?.text?.body || message?.button?.text || message?.interactive?.button_reply?.title || "").trim();
  const from = String(message?.from || "").trim();
  return {
    type: "inbound_message",
    messageId: String(message?.id || "").trim(),
    from,
    displayPhone: from,
    text,
    messageType: message?.type || "text",
    data: { from, body: text, type: message?.type || "text" },
    normalized: {
      from,
      fromPhone: from,
      messageId: String(message?.id || "").trim(),
      content: { type: message?.type || "text", text },
    },
    metadata: {
      phoneNumberId: metadata?.phone_number_id || null,
      displayPhoneNumber: metadata?.display_phone_number || null,
    },
  };
}

function walkMetaEntries(payload = {}) {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  const items = [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value && typeof change.value === "object" ? change.value : {};
      items.push({
        wabaId: String(entry?.id || "").trim() || null,
        field: String(change?.field || "").trim() || null,
        metadata: value.metadata || {},
        messages: Array.isArray(value.messages) ? value.messages : [],
        statuses: Array.isArray(value.statuses) ? value.statuses : [],
      });
    }
  }
  return items;
}

async function applyMessageStatus({ ownerUserId, statusEvent }) {
  const status = String(statusEvent?.status || "").toLowerCase();
  const messageId = String(statusEvent?.id || "").trim();
  const recipientId = String(statusEvent?.recipient_id || "").trim();
  const error = Array.isArray(statusEvent?.errors) ? statusEvent.errors[0] : null;

  log.info("estado de mensaje", {
    ownerUserId,
    status,
    messageId: messageId || null,
    recipientId: recipientId || null,
    code: error?.code || null,
    subcode: error?.error_data?.details || null,
  });

  const mapped = STATUS_TO_WHATSAPP[status];
  if (!mapped && status !== "failed") return { processed: true, reason: "status_ignored" };

  const resolved = await resolveGuestForInbound({
    ownerUserId,
    chatId: recipientId,
    displayPhone: recipientId,
  });
  if (!resolved?.guest) return { processed: true, reason: "status_guest_not_found" };

  if (status === "failed") {
    log.warn("mensaje fallido", {
      ownerUserId,
      guestId: resolved.guest.id,
      eventId: resolved.event?.id,
      messageId,
      code: error?.code || null,
      message: error?.title || error?.message || null,
    });
    return { processed: true, reason: "status_failed", guestId: resolved.guest.id };
  }

  const current = resolved.guest.whatsapp;
  const rank = { pendiente: 0, enviado: 1, entregado: 2, leido: 3, respondido: 4 };
  if ((rank[mapped] ?? 0) >= (rank[current] ?? 0) && current !== "respondido") {
    resolved.guest.whatsapp = mapped;
    await resolved.guest.save();
  }
  return { processed: true, reason: `status_${status}`, guestId: resolved.guest.id };
}

export async function processMetaWhatsappWebhook({ payload, rawBody = "" }) {
  const results = [];
  const items = walkMetaEntries(payload);

  for (const item of items) {
    const phoneNumberId = String(item.metadata?.phone_number_id || "").trim();
    if (!phoneNumberId) {
      log.warn("webhook sin phone_number_id", { field: item.field, wabaId: item.wabaId });
      results.push({ processed: false, reason: "missing_phone_number_id" });
      continue;
    }

    let resolved;
    try {
      resolved = await resolveMetaWhatsappByPhoneNumberId({ phoneNumberId });
    } catch (error) {
      log.warn("webhook no enrutado", {
        phoneNumberId,
        wabaId: item.wabaId,
        message: error.message,
      });
      results.push({ processed: false, reason: "unknown_phone_number_id", phoneNumberId });
      continue;
    }

    log.info("webhook enrutado", {
      phoneNumberId,
      wabaId: item.wabaId || resolved.integration.wabaId || null,
      ownerUserId: resolved.integration.ownerUserId,
      integrationId: resolved.integration.id,
      inbound: item.messages.length,
      statuses: item.statuses.length,
    });

    for (const message of item.messages) {
      const inbound = normalizeMetaInboundMessage({ message, metadata: item.metadata });
      const result = await handleInboundWhatsapp({
        payload: inbound,
        integration: resolved.integration,
        rawBody: inbound.messageId || rawBody,
      });
      results.push(result);
    }

    for (const statusEvent of item.statuses) {
      const statusKey = inboundDedupeKey({
        messageId: `${statusEvent.id}:${statusEvent.status}`,
      });
      const claimed = await claimInboundEvent({
        ownerUserId: resolved.integration.ownerUserId,
        dedupeKey: `status:${statusKey}`,
      });
      if (claimed.duplicate) {
        results.push({ processed: true, reason: "duplicate_status" });
        continue;
      }
      results.push(
        await applyMessageStatus({
          ownerUserId: resolved.integration.ownerUserId,
          statusEvent,
        }),
      );
    }
  }

  return {
    processed: results.some((row) => row.processed),
    results,
  };
}

export function assertMetaWebhookSignature(req) {
  const raw = typeof req.rawBody === "string" ? req.rawBody : Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  const header = req.headers["x-hub-signature-256"] || req.headers["x-hub-signature"];
  const verified = verifyMetaSignature(raw, header, env.meta.appSecret);
  if (!verified.ok) {
    log.warn("firma de webhook inválida", { reason: verified.reason });
    throw httpError(401, "Firma de webhook de Meta inválida.");
  }
  return raw;
}
