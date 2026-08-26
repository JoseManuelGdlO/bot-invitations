import { env } from "../config/env.js";
import { httpError } from "../utils/http-error.js";

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

export function requireWcTenantId(tenantId) {
  const id = String(tenantId || "").trim();
  if (!id) {
    throw httpError(400, "tenantId es obligatorio para operar un device de WhatsApp Connect.");
  }
  return id;
}

function devicePath(deviceId, suffix = "") {
  const id = encodeURIComponent(String(deviceId || "").trim());
  return `/devices/${id}${suffix}`;
}

function collectDeviceRows(payload) {
  const lists = [payload, payload?.devices, payload?.data, payload?.data?.devices, payload?.items].filter(Array.isArray);
  return lists[0] || [];
}

function readDeviceId(row = {}) {
  return String(row.id || row.deviceId || row.device_id || row?.data?.id || "").trim();
}

function readTenantId(row = {}) {
  return String(
    row.tenantId ||
      row.tenant_id ||
      row.ownerTenantId ||
      row.owner_tenant_id ||
      row.tenant?.id ||
      row.data?.tenantId ||
      row.data?.tenant_id ||
      "",
  ).trim();
}

function safeJsonParse(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function wcFetch(path, { method = "GET", body, headers = {}, tenantId } = {}) {
  ensureConfigured();
  const scopedTenant = tenantId !== undefined && tenantId !== null ? requireWcTenantId(tenantId) : null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.wc.timeoutMs);
  const authToken = String(env.wc.serviceJwt || "").trim();

  try {
    const response = await fetch(`${env.wc.apiUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
        ...(scopedTenant ? { "x-tenant-id": scopedTenant } : {}),
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
      if (err.status === 403) {
        throw httpError(
          403,
          scopedTenant
            ? "El device no está autorizado para este tenant."
            : "service_jwt_invalid_or_missing_scope",
        );
      }
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

const DEVICE_NOT_OWNED = "Este device no pertenece al tenant de WhatsApp Connect indicado.";
const DEVICE_OWNERSHIP_UNPROVEN =
  "WhatsApp Connect no confirmó la titularidad del device para este tenant.";

export const wcClient = {
  async connectDevice({ deviceId, tenantId }) {
    await wcFetch(devicePath(deviceId, "/connect"), { method: "POST", tenantId });
    return { ok: true };
  },

  async createPublicLink({ deviceId, tenantId }) {
    const payload = await wcFetch(devicePath(deviceId, "/public-link"), { method: "POST", tenantId });
    const url = readPublicLink(payload);
    if (!url) throw httpError(502, "WhatsApp Connect public link response invalid");
    return { url, expiresAt: readPublicLinkExpiry(payload) };
  },

  async getDevice({ deviceId, tenantId }) {
    return wcFetch(devicePath(deviceId), { method: "GET", tenantId });
  },

  async listTenantDevices({ tenantId }) {
    const tid = requireWcTenantId(tenantId);
    return wcFetch(`/tenants/${encodeURIComponent(tid)}/devices`, { method: "GET", tenantId: tid });
  },

  async assertDeviceOwnedByTenant({ deviceId, tenantId }) {
    const did = String(deviceId || "").trim();
    const tid = requireWcTenantId(tenantId);
    if (!did) throw httpError(400, "deviceId es obligatorio.");

    let listed = false;
    try {
      const listPayload = await wcClient.listTenantDevices({ tenantId: tid });
      listed = true;
      const match = collectDeviceRows(listPayload).find((row) => readDeviceId(row) === did);
      if (!match) throw httpError(403, DEVICE_NOT_OWNED);
      const matchTenant = readTenantId(match);
      if (matchTenant !== tid) throw httpError(403, matchTenant ? DEVICE_NOT_OWNED : DEVICE_OWNERSHIP_UNPROVEN);
      return { deviceId: did, tenantId: tid };
    } catch (err) {
      if (listed || Number(err?.status) !== 404) throw err;
    }

    let device;
    try {
      device = await wcClient.getDevice({ deviceId: did, tenantId: tid });
    } catch (err) {
      if (Number(err?.status) === 404) throw httpError(403, DEVICE_NOT_OWNED);
      throw err;
    }
    const claimed = readTenantId(device);
    if (!claimed) throw httpError(403, DEVICE_OWNERSHIP_UNPROVEN);
    if (claimed !== tid) throw httpError(403, DEVICE_NOT_OWNED);
    const remoteId = readDeviceId(device);
    if (remoteId && remoteId !== did) throw httpError(403, DEVICE_NOT_OWNED);
    return { deviceId: did, tenantId: tid };
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

    const scopedTenant = requireWcTenantId(tenantId);
    return wcFetch(devicePath(deviceId, "/messages/send"), {
      method: "POST",
      tenantId: scopedTenant,
      body: {
        ...messageBody,
        tenantId: scopedTenant,
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

  async getDeviceStatus({ deviceId, tenantId }) {
    const payload = await wcFetch(devicePath(deviceId, "/status"), { method: "GET", tenantId });
    const status = String(payload?.status || payload?.data?.status || "UNKNOWN").toUpperCase();
    return {
      status: ["ONLINE", "OFFLINE"].includes(status) ? status : "UNKNOWN",
      updatedAt: payload?.updatedAt || payload?.data?.updatedAt || new Date().toISOString(),
    };
  },
};
