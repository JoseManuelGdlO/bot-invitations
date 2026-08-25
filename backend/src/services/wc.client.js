import { env } from "../config/env.js";
import { httpError } from "../utils/http-error.js";
import { Logger } from "../utils/logger.js";

const wcLog = new Logger("WhatsApp");

class WcRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function ensureConfigured() {
  if (!env.wc.apiUrl) throw httpError(500, "WhatsApp Connect no está configurado");
  if (!env.wc.serviceJwt) throw httpError(500, "WC_SERVICE_JWT is required");
}

function safeJsonParse(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function wcFetch(path, { method = "GET", body, headers = {} } = {}) {
  ensureConfigured();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.wc.timeoutMs);
  const authToken = String(env.wc.serviceJwt || "").trim();

  try {
    const response = await fetch(`${env.wc.apiUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    const data = safeJsonParse(text);

    if (!response.ok) {
      const message = data?.message || data?.error || `WC error ${response.status}`;
      throw new WcRequestError(response.status, message);
    }

    return data;
  } catch (err) {
    if (err?.name === "AbortError") throw httpError(504, "WhatsApp Connect timeout");
    if (err instanceof WcRequestError) {
      if (err.status === 401 || err.status === 403) {
        console.error("[wc-client] service_jwt_invalid_or_missing_scope", { path, status: err.status });
      }
      if (err.status === 401) throw httpError(401, "service_jwt_invalid_or_missing_scope");
      if (err.status === 403) throw httpError(403, "service_jwt_invalid_or_missing_scope");
      if (err.status === 404) throw httpError(404, "WhatsApp Connect resource not found");
      if (err.status >= 500) throw httpError(502, "WhatsApp Connect upstream error");
      throw httpError(err.status, err.message || "WhatsApp Connect request failed");
    }
    throw httpError(502, "WhatsApp Connect network error");
  } finally {
    clearTimeout(timeout);
  }
}

function readPublicLink(payload) {
  return (
    payload?.url ||
    payload?.publicUrl ||
    payload?.link ||
    payload?.data?.url ||
    payload?.data?.publicUrl ||
    payload?.data?.link
  );
}

function readPublicLinkExpiry(payload) {
  return payload?.expiresAt || payload?.data?.expiresAt || payload?.expires_at || payload?.data?.expires_at || null;
}

export const wcClient = {
  async connectDevice(deviceId) {
    await wcFetch(`/devices/${deviceId}/connect`, { method: "POST" });
    return { ok: true };
  },

  async createPublicLink(deviceId) {
    const payload = await wcFetch(`/devices/${deviceId}/public-link`, { method: "POST" });
    const url = readPublicLink(payload);
    if (!url) throw httpError(502, "WhatsApp Connect public link response invalid");
    return { url, expiresAt: readPublicLinkExpiry(payload) };
  },

  async sendMessage({ deviceId, to, type = "text", text, imageUrl, documentUrl, fileName, caption, tenantId }) {
    const normalizedType = String(type || "text")
      .trim()
      .toLowerCase();
    if (normalizedType === "image" && !String(imageUrl || "").trim()) {
      throw httpError(400, "imageUrl is required when type=image");
    }
    if (normalizedType === "document") {
      if (!String(documentUrl || "").trim()) {
        throw httpError(400, "documentUrl is required when type=document");
      }
      if (!String(fileName || "").trim()) {
        throw httpError(400, "fileName is required when type=document");
      }
    }
    if (normalizedType === "text" && !String(text || "").trim()) {
      throw httpError(400, "text is required when type=text");
    }

    const messageBody =
      normalizedType === "image"
        ? {
            to,
            type: "image",
            imageUrl: String(imageUrl || "").trim(),
            ...(String(caption || "").trim() ? { caption: String(caption || "").trim() } : {}),
          }
        : normalizedType === "document"
          ? {
              to,
              type: "document",
              documentUrl: String(documentUrl || "").trim(),
              fileName: String(fileName || "").trim(),
              ...(String(caption || "").trim() ? { caption: String(caption || "").trim() } : {}),
            }
          : {
              to,
              type: "text",
              text: String(text || ""),
            };

    const path = `/devices/${deviceId}/messages/send`;
    wcLog.info(`POST ${path}`, {
      to: messageBody.to,
      type: messageBody.type,
      chars: String(text || caption || "").length,
    });
    return wcFetch(path, {
      method: "POST",
      headers: {
        ...(tenantId ? { "x-tenant-id": String(tenantId) } : {}),
      },
      body: {
        ...messageBody,
        ...(tenantId ? { tenantId } : {}),
      },
    });
  },

  async sendMessageWithRetry(params, { maxAttempts = 3, baseDelayMs = 250 } = {}) {
    let attempt = 0;
    while (true) {
      attempt += 1;
      try {
        return await wcClient.sendMessage(params);
      } catch (error) {
        const status = Number(error?.status || 0);
        const retryable = status === 429 || status >= 500 || status === 504;
        if (!retryable || attempt >= maxAttempts) throw error;
        const jitter = Math.floor(Math.random() * 100);
        const delay = baseDelayMs * attempt + jitter;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  },

  async getDeviceStatus({ deviceId }) {
    const payload = await wcFetch(`/devices/${deviceId}/status`, { method: "GET" });
    const status = String(payload?.status || payload?.data?.status || "UNKNOWN").toUpperCase();
    return {
      status: ["ONLINE", "OFFLINE"].includes(status) ? status : "UNKNOWN",
      updatedAt: payload?.updatedAt || payload?.data?.updatedAt || new Date().toISOString(),
    };
  },
};
