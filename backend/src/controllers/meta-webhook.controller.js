import crypto from "crypto";
import { env } from "../config/env.js";
import { httpError } from "../utils/http-error.js";
import { Logger } from "../utils/logger.js";
import { summarizeMetaErrors } from "../utils/meta-error.js";
import { normalizeWaIdTo10 } from "../utils/whatsapp-identity.js";

const waLog = new Logger("WhatsApp");

function logMetaWebhook(event, extra = {}) {
  console.log("[meta-webhook]", event, extra);
}

function safeCompareUtf8(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length === 0 || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function readHubParam(query, name) {
  const dotted = query?.[name];
  if (dotted != null && dotted !== "") return String(Array.isArray(dotted) ? dotted[0] : dotted);
  const nestedKey = name.replace(/^hub\./, "");
  const nested = query?.hub?.[nestedKey];
  if (nested != null && nested !== "") return String(Array.isArray(nested) ? nested[0] : nested);
  return "";
}

function readRawBody(req) {
  if (typeof req.rawBody === "string") return req.rawBody;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  return "";
}

function safeParseBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const raw = readRawBody(req).trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw httpError(400, "JSON de webhook inválido.");
  }
}

function extractMetaMessageText(message = {}) {
  if (message.text?.body) return String(message.text.body).trim();
  if (message.button?.text) return String(message.button.text).trim();
  if (message.button?.payload) return String(message.button.payload).trim();
  const reply = message.interactive?.button_reply || message.interactive?.list_reply;
  if (reply?.title) return String(reply.title).trim();
  if (reply?.id) return String(reply.id).trim();
  return "";
}

export function extractMetaInboundMessages(body = {}) {
  const entries = Array.isArray(body.entry) ? body.entry : [];
  const out = [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value && typeof change.value === "object" ? change.value : {};
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const message of messages) {
        const waId = String(message.from || contacts[0]?.wa_id || "").trim();
        const phone = normalizeWaIdTo10(waId);
        const type = String(message.type || "text").toLowerCase();
        const phoneNumberId = String(value.metadata?.phone_number_id || "").trim();
        out.push({
          type: "message.inbound",
          from: phone || waId,
          fromPhone: phone || waId,
          text: extractMetaMessageText(message),
          messageId: String(message.id || "").trim(),
          messageType: type,
          waId,
          phoneNumberId: phoneNumberId || null,
        });
      }
    }
  }
  return out;
}

export function extractMetaStatuses(body = {}) {
  const entries = Array.isArray(body.entry) ? body.entry : [];
  const out = [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value && typeof change.value === "object" ? change.value : {};
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      const phoneNumberId = String(value.metadata?.phone_number_id || "").trim();
      for (const status of statuses) {
        const recipient = String(status.recipient_id || "").trim();
        out.push({
          type: "message.status",
          messageId: String(status.id || "").trim(),
          status: String(status.status || "").toLowerCase(),
          recipientId: normalizeWaIdTo10(recipient) || recipient,
          phoneNumberId: phoneNumberId || null,
          errors: summarizeMetaErrors(status.errors),
        });
      }
    }
  }
  return out;
}

/** GET de verificación de Meta (hub.mode / hub.challenge / hub.verify_token). */
export function verifyMetaWebhook(req, res) {
  const mode = readHubParam(req.query, "hub.mode");
  const challenge = readHubParam(req.query, "hub.challenge");
  const token = readHubParam(req.query, "hub.verify_token");
  const expected = String(env.meta?.webhookVerifyToken || "").trim();

  if (mode === "subscribe" && challenge && expected && safeCompareUtf8(token, expected)) {
    logMetaWebhook("meta challenge ok");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(200).send(challenge);
  }

  logMetaWebhook("meta challenge failed", {
    mode: mode || null,
    hasChallenge: Boolean(challenge),
    hasVerifyToken: Boolean(expected),
  });
  return res.status(403).json({ error: "Challenge de webhook inválido." });
}

export async function postMetaEvents(req, res, next) {
  try {
    const { handleInboundWhatsapp } = await import("./bot.controller.js");
    const { resolveActiveWhatsappMetaByPhoneNumberId } = await import("../services/whatsapp-meta.service.js");
    const { applyWhatsappDeliveryStatus } = await import("../services/whatsapp-status.service.js");
    const payload = safeParseBody(req);
    const messages = extractMetaInboundMessages(payload);
    const statuses = extractMetaStatuses(payload);
    if (messages.length || statuses.length) {
      waLog.info("webhook received", {
        messages: messages.length,
        statuses: statuses.length,
        failed: statuses.filter((row) => row.status === "failed").length,
      });
    }
    const results = [];
    for (const inbound of messages) {
      if (!inbound.phoneNumberId) {
        logMetaWebhook("inbound skipped: missing phone_number_id");
        results.push({ processed: true, reason: "missing_phone_number_id" });
        continue;
      }
      const resolved = await resolveActiveWhatsappMetaByPhoneNumberId(inbound.phoneNumberId);
      if (!resolved?.integration) {
        logMetaWebhook("inbound skipped: integration not found", {
          phoneNumberId: inbound.phoneNumberId,
        });
        results.push({ processed: true, reason: "integration_not_found" });
        continue;
      }
      const result = await handleInboundWhatsapp({
        payload: inbound,
        integration: resolved.integration,
        rawBody: inbound.messageId || readRawBody(req),
      });
      results.push(result);
    }
    for (const status of statuses) {
      const result = await applyWhatsappDeliveryStatus(status);
      results.push(result);
    }
    res.status(200).json({ ok: true, processed: results.length, results });
  } catch (error) {
    next(error);
  }
}

export const metaWebhook = [postMetaEvents];
