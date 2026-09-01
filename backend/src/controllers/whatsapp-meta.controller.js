import { env } from "../config/env.js";
import { asyncHandler } from "../utils/async.js";
import { httpError } from "../utils/http-error.js";
import { Logger } from "../utils/logger.js";
import { metaClient, sanitizeMetaBodyParam } from "../services/meta.client.js";

const log = new Logger("WhatsApp");

function requestHeader(req, name) {
  if (typeof req.get === "function") {
    const value = req.get(name);
    if (value) return String(value).split(",")[0].trim();
  }
  const headers = req.headers || {};
  const raw = headers[name] || headers[String(name).toLowerCase()];
  if (raw == null || raw === "") return "";
  return String(Array.isArray(raw) ? raw[0] : raw).split(",")[0].trim();
}

function isDevEnv() {
  return env.nodeEnv !== "production";
}

function metaWebhookUrl(req) {
  if (!isDevEnv()) return null;
  const proto = requestHeader(req, "x-forwarded-proto") || req.protocol || "http";
  const host = requestHeader(req, "x-forwarded-host") || requestHeader(req, "host");
  if (!host) return "/api/webhooks/meta";
  return `${proto}://${host}/api/webhooks/meta`;
}

export const getWhatsappMetaStatus = asyncHandler(async (req, res) => {
  const token = String(env.meta?.accessToken || "").trim();
  const phoneNumberId = String(env.meta?.phoneNumberId || "").trim();
  const templateName = String(env.meta?.templateName || "").trim();
  const templateLanguage = String(env.meta?.templateLanguage || "es_MX").trim();

  res.json({
    provider: "meta-cloud",
    configured: Boolean(token && phoneNumberId),
    hasTemplate: Boolean(templateName),
    templateName: templateName || null,
    templateLanguage: templateLanguage || "es_MX",
    webhookUrl: metaWebhookUrl(req),
  });
});

export const postWhatsappMetaSendTest = asyncHandler(async (req, res) => {
  const to = String(req.body?.to || "").trim();
  const type = String(req.body?.type || "text").trim().toLowerCase();
  const text = String(req.body?.text || "").trim();
  const name = sanitizeMetaBodyParam(req.body?.name) || "invitado";

  if (type !== "text" && type !== "template") {
    throw httpError(400, "type debe ser text o template.");
  }

  let payload;
  if (type === "template") {
    const bodyParam = sanitizeMetaBodyParam(text);
    if (!bodyParam) throw httpError(400, "El texto de la plantilla es obligatorio.");
    payload = await metaClient.sendTemplateWithRetry({
      to,
      bodyParams: [name, bodyParam],
    });
  } else {
    if (!text || text.length > 4096) throw httpError(400, "El texto de prueba es obligatorio.");
    payload = await metaClient.sendTextWithRetry({ to, text });
  }

  log.info("send-test", { type });
  res.status(202).json({
    ok: true,
    type,
    id: payload?.messages?.[0]?.id || payload?.id || null,
  });
});
