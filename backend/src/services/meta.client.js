import { env } from "../config/env.js";
import { httpError } from "../utils/http-error.js";
import { Logger } from "../utils/logger.js";
import { summarizeMetaError } from "../utils/meta-error.js";
import { formatWhatsappGraphTo } from "../utils/whatsapp-identity.js";

const metaLog = new Logger("WhatsApp");
const BODY_PARAM_MAX = 1024;

class MetaRequestError extends Error {
  constructor(status, message, meta = null) {
    super(message);
    this.status = status;
    this.meta = meta;
  }
}

export function sanitizeMetaBodyParam(value) {
  return String(value || "")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\n\t]+/g, " ")
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

function graphUrl(phoneNumberId, suffix) {
  const version = String(env.meta.graphVersion || "v21.0").replace(/^\//, "");
  return `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/${suffix}`;
}

function graphMessagesUrl(phoneNumberId) {
  return graphUrl(phoneNumberId, "messages");
}

function graphMediaUrl(phoneNumberId) {
  return graphUrl(phoneNumberId, "media");
}

function headerDocumentFrom(headerDocument) {
  if (!headerDocument) return null;
  const id = String(headerDocument.id || "").trim();
  const filename = String(headerDocument.filename || headerDocument.fileName || "").trim();
  if (!id) throw httpError(400, "La plantilla con documento requiere un archivo adjunto.");
  return { id, filename };
}

function resolveTemplateName(templateName, headerDocument) {
  const documentName = String(env.meta?.templateNameDocument || "").trim();
  if (headerDocument) {
    // Siempre la plantilla de documento del env (prod: rg_eventos), no un nombre viejo del job.
    if (!documentName) throw httpError(400, "Falta META_TEMPLATE_NAME_DOCUMENT.");
    return documentName;
  }
  const name = String(templateName || env.meta?.templateName || "").trim();
  if (!name) throw httpError(400, "Falta META_TEMPLATE_NAME.");
  if (documentName && name === documentName) {
    throw httpError(400, "La plantilla con documento requiere un archivo adjunto.");
  }
  return name;
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
      const meta = summarizeMetaError(data);
      const message = meta.message || meta.details || `Meta error ${response.status}`;
      metaLog.error("Graph messages error", {
        httpStatus: response.status,
        to: body?.to || null,
        kind: body?.type || null,
        template: body?.template?.name || null,
        ...meta,
      });
      throw new MetaRequestError(response.status, message, meta);
    }
    return data;
  } catch (err) {
    if (err?.name === "AbortError") throw httpError(504, "Meta Cloud API timeout");
    if (err instanceof MetaRequestError) {
      const wrapped = err.status >= 500
        ? httpError(502, "Meta Cloud API upstream error")
        : httpError(err.status, err.message);
      wrapped.meta = err.meta;
      throw wrapped;
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

  async sendTemplate({ to, bodyParams = [], accessToken, phoneNumberId, templateName, headerDocument } = {}) {
    const header = headerDocumentFrom(headerDocument);
    const name = resolveTemplateName(templateName, header);
    const phone = requirePhone(to);
    const language = String(env.meta?.templateLanguage || "es_MX").trim();
    const parameters = bodyParams.map((value) => ({
      type: "text",
      text: sanitizeMetaBodyParam(value),
    }));
    const components = [];
    if (header) {
      components.push({
        type: "header",
        parameters: [
          {
            type: "document",
            document: {
              id: header.id,
              ...(header.filename ? { filename: header.filename } : {}),
            },
          },
        ],
      });
    }
    components.push({ type: "body", parameters });
    metaLog.info("POST graph messages template", { to: phone, name, language, hasDocument: Boolean(header) });
    return metaFetch(
      {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name,
          language: { code: language },
          components,
        },
      },
      { accessToken, phoneNumberId },
    );
  },

  async uploadDocument({ filePath, buffer, filename, mime, accessToken, phoneNumberId } = {}) {
    const { token, phoneId } = requireMetaAuth({ accessToken, phoneNumberId });
    let fileBuffer = buffer;
    if (!fileBuffer && filePath) {
      const fs = await import("node:fs/promises");
      try {
        fileBuffer = await fs.readFile(filePath);
      } catch (err) {
        if (err?.code === "ENOENT") {
          throw httpError(400, "Activa el adjunto pero falta el documento.");
        }
        throw err;
      }
    }
    if (!fileBuffer?.length) throw httpError(400, "La plantilla con documento requiere un archivo adjunto.");
    const fileName = String(filename || "documento.pdf").trim() || "documento.pdf";
    const type = String(mime || "application/pdf").trim() || "application/pdf";
    const form = new FormData();
    const bytes = fileBuffer instanceof Uint8Array ? fileBuffer : new Uint8Array(fileBuffer);
    const file = typeof File === "function"
      ? new File([bytes], fileName, { type })
      : new Blob([bytes], { type });
    form.append("messaging_product", "whatsapp");
    // Meta espera el MIME real (application/pdf), no el enum "document".
    form.append("type", type);
    form.append("file", file, fileName);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(env.meta.mediaTimeoutMs || 60000));
    try {
      metaLog.info("POST graph media document", { phoneNumberId: phoneId, filename: fileName, bytes: fileBuffer.length });
      const response = await fetch(graphMediaUrl(phoneId), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
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
        const meta = summarizeMetaError(data);
        const message = meta.message || meta.details || `Meta error ${response.status}`;
        metaLog.error("Graph media error", {
          httpStatus: response.status,
          filename: fileName,
          ...meta,
        });
        throw new MetaRequestError(response.status, message, meta);
      }
      const mediaId = String(data?.id || "").trim();
      if (!mediaId) throw httpError(502, "Meta Cloud API no devolvió media id.");
      return mediaId;
    } catch (err) {
      if (err?.name === "AbortError") throw httpError(504, "Meta Cloud API timeout");
      if (err instanceof MetaRequestError) {
        const wrapped = err.status >= 500
          ? httpError(502, "Meta Cloud API upstream error")
          : httpError(err.status, err.message);
        wrapped.meta = err.meta;
        throw wrapped;
      }
      if (err?.status) throw err;
      throw httpError(502, "Meta Cloud API network error");
    } finally {
      clearTimeout(timeout);
    }
  },

  async sendTextWithRetry(params, opts) {
    return withRetry(() => metaClient.sendText(params), opts);
  },

  async sendTemplateWithRetry(params, opts) {
    return withRetry(() => metaClient.sendTemplate(params), opts);
  },
};
