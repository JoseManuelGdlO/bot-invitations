import { env } from "../config/env.js";
import { httpError } from "../utils/http-error.js";
import { Logger } from "../utils/logger.js";

const log = new Logger("MetaGraph");

function graphBase() {
  const version = String(env.meta.graphVersion || "v22.0").replace(/^\/+|\/+$/g, "");
  return `https://graph.facebook.com/${version}`;
}

export function attachMetaError(err, details = {}) {
  err.meta = {
    httpStatus: details.httpStatus ?? err.status ?? null,
    code: details.code ?? null,
    subcode: details.subcode ?? null,
    message: details.message ?? err.message,
    fbtraceId: details.fbtraceId ?? null,
  };
  return err;
}

function userFacingMetaMessage(code, fallback) {
  const known = {
    190: "El token de WhatsApp ya no es válido. Vuelve a conectar la cuenta.",
    100: "La solicitud a Meta fue rechazada. Revisa la configuración de la app.",
    10: "La app de Meta no tiene el permiso necesario.",
    33: "No se encontró el recurso de WhatsApp en Meta.",
    131000: "WhatsApp no pudo enviar el mensaje. Inténtalo de nuevo.",
    131026: "El número de destino no es un WhatsApp válido.",
    131047: "Han pasado más de 24 horas. Debes usar una plantilla aprobada.",
    131051: "El tipo de mensaje no está soportado.",
    132000: "La plantilla de WhatsApp fue rechazada o no existe.",
    132001: "La plantilla no está disponible en este idioma.",
    133010: "El número de WhatsApp no está registrado en Cloud API.",
  };
  return known[Number(code)] || fallback || "Error de la API de WhatsApp (Meta).";
}

export function parseGraphErrorPayload(payload = {}, httpStatus = 500) {
  const error = payload?.error && typeof payload.error === "object" ? payload.error : {};
  const code = error.code ?? error.error_code ?? null;
  const subcode = error.error_subcode ?? error.error_user_title ?? null;
  const message = String(error.message || error.error_user_msg || payload?.error || "Error de Graph API").trim();
  const fbtraceId = error.fbtrace_id || error.fbtraceId || null;
  return { httpStatus, code, subcode, message, fbtraceId };
}

export function graphErrorFromResponse(httpStatus, payload) {
  const details = parseGraphErrorPayload(payload, httpStatus);
  const err = httpError(httpStatus >= 400 && httpStatus < 600 ? httpStatus : 502, userFacingMetaMessage(details.code, details.message));
  return attachMetaError(err, details);
}

async function parseResponse(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text.slice(0, 300) } };
  }
}

export async function graphRequest({ method = "GET", path, token, query = {}, body, timeoutMs = 15000 } = {}) {
  const url = new URL(`${graphBase()}/${String(path || "").replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body != null) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const err = httpError(502, "No se pudo contactar la API de Meta.");
    attachMetaError(err, { httpStatus: 502, message: error.message });
    log.error("Graph API red falló", { path, method, message: error.message });
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const payload = await parseResponse(res);
  if (!res.ok) {
    const err = graphErrorFromResponse(res.status, payload);
    log.error("Graph API error", {
      path,
      method,
      httpStatus: err.meta?.httpStatus,
      code: err.meta?.code,
      subcode: err.meta?.subcode,
      fbtraceId: err.meta?.fbtraceId,
      message: err.meta?.message,
    });
    throw err;
  }
  return payload;
}

export async function exchangeEmbeddedSignupCode(code) {
  const appId = String(env.meta.appId || "").trim();
  const appSecret = String(env.meta.appSecret || "").trim();
  if (!appId || !appSecret) {
    throw httpError(500, "Faltan META_APP_ID o META_APP_SECRET en el servidor.");
  }
  const payload = await graphRequest({
    method: "GET",
    path: "oauth/access_token",
    query: {
      client_id: appId,
      client_secret: appSecret,
      code: String(code || "").trim(),
    },
  });
  const accessToken = String(payload.access_token || "").trim();
  if (!accessToken) throw httpError(502, "Meta no devolvió un access token intercambiable.");
  return {
    accessToken,
    tokenType: payload.token_type || null,
    expiresIn: payload.expires_in ?? null,
  };
}

export async function subscribeWabaApp(wabaId, token) {
  return graphRequest({
    method: "POST",
    path: `${wabaId}/subscribed_apps`,
    token,
  });
}

export async function unsubscribeWabaApp(wabaId, token) {
  return graphRequest({
    method: "DELETE",
    path: `${wabaId}/subscribed_apps`,
    token,
  });
}

export async function listWabaPhoneNumbers(wabaId, token) {
  const payload = await graphRequest({
    method: "GET",
    path: `${wabaId}/phone_numbers`,
    token,
    query: {
      fields: "id,display_phone_number,verified_name,quality_rating,is_on_biz_app,platform_type",
    },
  });
  return Array.isArray(payload.data) ? payload.data : [];
}

export async function getPhoneNumberDetails(phoneNumberId, token) {
  return graphRequest({
    method: "GET",
    path: phoneNumberId,
    token,
    query: {
      fields: "id,display_phone_number,verified_name,quality_rating,is_on_biz_app,platform_type",
    },
  });
}

export async function sendCloudMessage({ phoneNumberId, token, payload }) {
  return graphRequest({
    method: "POST",
    path: `${phoneNumberId}/messages`,
    token,
    body: payload,
  });
}

export async function initiateCoexistenceSync({ phoneNumberId, token, syncType }) {
  return graphRequest({
    method: "POST",
    path: `${phoneNumberId}/smb_app_data`,
    token,
    body: {
      messaging_product: "whatsapp",
      sync_type: syncType,
    },
  });
}
