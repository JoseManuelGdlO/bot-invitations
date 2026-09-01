import { env } from "../config/env.js";
import { httpError } from "../utils/http-error.js";
import { Logger } from "../utils/logger.js";
import { formatWhatsappGraphTo } from "../utils/whatsapp-identity.js";

const metaLog = new Logger("WhatsApp");
const BODY_PARAM_MAX = 1024;

class MetaRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function sanitizeMetaBodyParam(value) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim()
    .slice(0, BODY_PARAM_MAX);
}

function requireMetaAuth({ accessToken, phoneNumberId } = {}) {
  const token = String(accessToken || "").trim();
  const phoneId = String(phoneNumberId || "").trim();
  if (!token || !phoneId) {
    throw httpError(400, "Faltan credenciales de WhatsApp (Meta).");
  }
  return { token, phoneId };
}

function graphMessagesUrl(phoneNumberId) {
  const version = String(env.meta.graphVersion || "v21.0").replace(/^\//, "");
  return `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`;
}

function requirePhone(to) {
  const phone = formatWhatsappGraphTo(to);
  if (!phone) throw httpError(400, "Teléfono de WhatsApp inválido.");
  return phone;
}

async function metaFetch(body, auth) {
  const { token, phoneId } = requireMetaAuth(auth);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(env.meta.timeoutMs || 8000));
  try {
    const response = await fetch(graphMessagesUrl(phoneId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }
    if (!response.ok) {
      const message = data?.error?.message || data?.message || `Meta error ${response.status}`;
      throw new MetaRequestError(response.status, message);
    }
    return data;
  } catch (err) {
    if (err?.name === "AbortError") throw httpError(504, "Meta Cloud API timeout");
    if (err instanceof MetaRequestError) {
      if (err.status >= 500) throw httpError(502, "Meta Cloud API upstream error");
      throw httpError(err.status, err.message);
    }
    throw httpError(502, "Meta Cloud API network error");
  } finally {
    clearTimeout(timeout);
  }
}

async function withRetry(run, { maxAttempts = 3, baseDelayMs = 250 } = {}) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      return await run();
    } catch (error) {
      const status = Number(error?.status || 0);
      const retryable = status === 429 || status >= 500 || status === 504;
      if (!retryable || attempt >= maxAttempts) throw error;
      const jitter = Math.floor(Math.random() * 100);
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt + jitter));
    }
  }
}

export const metaClient = {
  async sendText({ to, text, accessToken, phoneNumberId }) {
    const phone = requirePhone(to);
    const body = String(text || "").trim();
    if (!body) throw httpError(400, "text is required when type=text");
    metaLog.info("POST graph messages text", { to: phone, chars: body.length });
    return metaFetch(
      {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body },
      },
      { accessToken, phoneNumberId },
    );
  },

  async sendTemplate({ to, bodyParams = [], accessToken, phoneNumberId }) {
    const name = String(env.meta?.templateName || "").trim();
    if (!name) throw httpError(400, "Falta META_TEMPLATE_NAME.");
    const phone = requirePhone(to);
    const language = String(env.meta?.templateLanguage || "es_MX").trim();
    const parameters = bodyParams.map((value) => ({
      type: "text",
      text: sanitizeMetaBodyParam(value),
    }));
    metaLog.info("POST graph messages template", { to: phone, name, language });
    return metaFetch(
      {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name,
          language: { code: language },
          components: [{ type: "body", parameters }],
        },
      },
      { accessToken, phoneNumberId },
    );
  },

  async sendTextWithRetry(params, opts) {
    return withRetry(() => metaClient.sendText(params), opts);
  },

  async sendTemplateWithRetry(params, opts) {
    return withRetry(() => metaClient.sendTemplate(params), opts);
  },
};
