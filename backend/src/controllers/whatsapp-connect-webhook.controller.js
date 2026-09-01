import crypto from "crypto";
import { env } from "../config/env.js";
import { httpError } from "../utils/http-error.js";
import { resolveWhatsappConnectIntegrationByDevice } from "../services/integration-resolver.service.js";
import { postWhatsappConnectEvents } from "./bot.controller.js";

function logWcWebhook(event, extra = {}) {
  console.log("[wc-webhook]", event, extra);
}

function toMillis(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    if (raw.length >= 13) return numeric;
    return numeric * 1000;
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function safeCompareHex(a, b) {
  const left = Buffer.from(String(a || ""), "hex");
  const right = Buffer.from(String(b || ""), "hex");
  if (left.length === 0 || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export { verifyMetaWebhook } from "./meta-webhook.controller.js";

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

export async function resolveWhatsappWebhookIntegration(req, _res, next) {
  try {
    const payload = safeParseBody(req);
    req.wc = { ...(req.wc || {}), payload };

    const deviceId = String(payload?.deviceId || payload?.device?.id || payload?.data?.deviceId || "").trim();
    const eventId = String(payload?.eventId || payload?.id || "").trim();
    const eventType = String(payload?.type || payload?.event || "").trim();
    if (!deviceId) throw httpError(400, "Falta deviceId para enrutar el webhook.");

    const resolved = await resolveWhatsappConnectIntegrationByDevice({ deviceId });
    req.wc = { ...req.wc, ...resolved };
    logWcWebhook("routed", {
      eventId: eventId || null,
      eventType: eventType || null,
      deviceId,
      integrationId: resolved.integration?.id,
      ownerUserId: resolved.integration?.ownerUserId,
    });
    if (env.wc.webhookDebug) {
      logWcWebhook("payload summary", {
        hasNormalized: Boolean(payload?.normalized),
        bodyBytes: readRawBody(req).length,
      });
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function verifyWcSignature(req, _res, next) {
  try {
    const secret = String(req.wc?.credentials?.webhookSecret || "").trim();
    if (!secret) throw httpError(401, "Falta el secreto del webhook.");

    const signature = String(req.headers["x-wc-signature"] || req.headers["x-signature"] || "").trim();
    const timestamp = String(req.headers["x-wc-timestamp"] || req.headers["x-timestamp"] || "").trim();
    if (!signature || !timestamp) throw httpError(401, "Faltan cabeceras de firma del webhook.");

    const payload = `${timestamp}.${readRawBody(req)}`;
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    if (!safeCompareHex(signature, expected)) throw httpError(401, "Firma de webhook inválida.");

    req.wc = {
      ...req.wc,
      signatureVerified: true,
      requestTimestampMs: toMillis(timestamp),
    };
    next();
  } catch (err) {
    if (err.status === 401) logWcWebhook("signature verify failed", { message: err.message });
    next(err);
  }
}

export function antiReplayWindow(req, _res, next) {
  try {
    const requestTs = Number(req.wc?.requestTimestampMs || 0);
    const maxSkewMs = env.wc.webhookMaxSkewMs;
    if (!requestTs) throw httpError(401, "Timestamp de webhook inválido.");
    const drift = Math.abs(Date.now() - requestTs);
    if (drift > maxSkewMs) {
      logWcWebhook("anti-replay: timestamp outside window", { requestTs, driftMs: drift, maxSkewMs });
      throw httpError(401, "El timestamp del webhook está fuera de la ventana permitida.");
    }
    next();
  } catch (error) {
    next(error);
  }
}

export const whatsappConnectWebhook = [
  resolveWhatsappWebhookIntegration,
  verifyWcSignature,
  antiReplayWindow,
  postWhatsappConnectEvents,
];
