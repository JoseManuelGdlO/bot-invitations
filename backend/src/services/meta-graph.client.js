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

const META_VAR_ERROR_DENSITY =
  "Esta plantilla tiene demasiadas variables en relación con su longitud. Reduce el número de variables o aumenta la longitud del mensaje.";
const META_VAR_ERROR_START = "Las variables no pueden ir al principio del mensaje.";
const META_VAR_ERROR_END = "Las variables no pueden ir al final del mensaje.";

function variablePolicyCopy(subcode, message) {
  const haystack = [message, subcode]
    .filter((value) => value != null && String(value).trim())
    .map((value) => String(value).toLowerCase())
    .join(" ");
  if (!haystack) return null;
  const parts = [];
  if (haystack.includes("too many variable")) parts.push(META_VAR_ERROR_DENSITY);
  const mentionsStart = haystack.includes("cannot be at the start") || haystack.includes("start or end");
  const mentionsEnd = haystack.includes("cannot be at the end") || haystack.includes("start or end");
  if (mentionsStart) parts.push(META_VAR_ERROR_START);
  if (mentionsEnd) parts.push(META_VAR_ERROR_END);
  return parts.length ? parts.join(" ") : null;
}

function userFacingMetaMessage(code, fallback, subcode, searchText) {
  const variableCopy = variablePolicyCopy(subcode, searchText || fallback);
  if (variableCopy) return variableCopy;
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
  const error = payload?.error && typeof payload.error === "object" ? payload.error : {};
  const searchText = [details.message, error.error_user_msg, error.error_user_title]
    .filter((value) => value != null && String(value).trim())
    .join(" ");
  const err = httpError(
    httpStatus >= 400 && httpStatus < 600 ? httpStatus : 502,
    userFacingMetaMessage(details.code, details.message, details.subcode, searchText),
  );
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

export async function graphRequest({
  method = "GET",
  path,
  token,
  query = {},
  body,
  timeoutMs = 15000,
  errorLog = "error",
} = {}) {
  const url = new URL(`${graphBase()}/${String(path || "").replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body != null) headers["Content-Type"] = "application/json";

  const described = describeGraphToken(token);
  log.info("graphRequest Authorization", {
    path,
    method,
    tokenSource: described.source,
    tokenPreview: described.preview,
    equalsPlatform: described.equalsPlatform,
  });
  if (env.meta.debugGraphToken) {
    console.log(`[MetaGraph] Authorization Bearer source=${described.source} preview=${described.preview}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url.toString(), {
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
    const graphErrorMeta = {
      path,
      method,
      httpStatus: err.meta?.httpStatus,
      code: err.meta?.code,
      subcode: err.meta?.subcode,
      fbtraceId: err.meta?.fbtraceId,
      message: err.meta?.message,
    };
    if (errorLog === "warn") log.warn("Graph API error", graphErrorMeta);
    else log.error("Graph API error", graphErrorMeta);
    throw err;
  }
  return payload;
}

export function describeGraphToken(token) {
  const value = String(token || "").trim();
  const platform = String(env.meta.accessToken || "").trim();
  if (!value) return { source: "missing", preview: null };
  const source = platform && value === platform
    ? (String(process.env.META_ACCESS_TOKEN || "").trim()
      ? "META_ACCESS_TOKEN"
      : String(process.env.META_SYSTEM_USER_TOKEN || "").trim()
        ? "META_SYSTEM_USER_TOKEN"
        : "META_ACCESS_TOKEN")
    : "plannerAccessToken";
  return {
    source,
    preview: `${value.slice(0, 8)}…len=${value.length}`,
    equalsPlatform: Boolean(platform && value === platform),
  };
}

export function resolveTemplateCrudToken(plannerAccessToken) {
  const token = String(plannerAccessToken || "").trim();
  if (!token) throw httpError(400, "Falta el token de WhatsApp de la cuenta.");
  const platform = String(env.meta.accessToken || "").trim();
  if (platform && token === platform) {
    throw httpError(
      400,
      "Esta cuenta está usando el token de la plataforma. Vuelve a conectar WhatsApp con Embedded Signup.",
    );
  }
  return token;
}

function isBenignWabaLinkError(error) {
  const code = Number(error?.meta?.code);
  const subcode = Number(error?.meta?.subcode);
  if (code === 100 && subcode === 33) return false;
  const details = [error?.message, error?.meta?.message].filter(Boolean).join(" ");
  if (/\bdoes not exist\b|nonexist/i.test(details)) return false;
  return /\balready\b|\bduplicate\b|\blinked\b|\bshared\b/i.test(details);
}

export async function shareClientWhatsappBusinessAccount({ wabaId, businessId, token } = {}) {
  const id = String(businessId || env.meta.businessId || "").trim();
  const waba = String(wabaId || "").trim();
  const access = String(token || env.meta.accessToken || "").trim();
  if (!id) throw httpError(500, "Falta META_BUSINESS_ID para vincular el WABA al portafolio.");
  if (!waba) throw httpError(400, "Falta el WABA ID.");
  if (!access) throw httpError(400, "Falta META_ACCESS_TOKEN.");
  return graphRequest({
    method: "POST",
    path: `${id}/client_whatsapp_business_accounts`,
    token: access,
    query: { waba_id: waba },
    errorLog: "warn",
  });
}

export async function assignSystemUserToWaba({ wabaId, systemUserId, token } = {}) {
  const waba = String(wabaId || "").trim();
  const user = String(systemUserId || env.meta.systemUserId || "").trim();
  const access = String(token || "").trim();
  if (!waba) throw httpError(400, "Falta el WABA ID.");
  if (!user) throw httpError(400, "Falta el system user ID.");
  if (!access) throw httpError(400, "Falta el token para asignar el system user.");
  return graphRequest({
    method: "POST",
    path: `${waba}/assigned_users`,
    token: access,
    query: {
      user,
      tasks: JSON.stringify(["MANAGE"]),
    },
    errorLog: "warn",
  });
}

export async function ensurePlatformCanManageWaba({ wabaId, plannerAccessToken } = {}) {
  const platformToken = String(env.meta.accessToken || "").trim();
  if (!platformToken) {
    return { skipped: true, reason: "no_platform_token", shared: false, assigned: false };
  }
  const waba = String(wabaId || "").trim();
  if (!waba) {
    return { skipped: true, reason: "no_waba", shared: false, assigned: false };
  }

  const businessId = String(env.meta.businessId || "").trim();
  const shareToken = String(plannerAccessToken || platformToken).trim();
  let shared = false;
  if (businessId) {
    try {
      await shareClientWhatsappBusinessAccount({ wabaId: waba, businessId, token: shareToken });
      shared = true;
      log.info("OBO: WABA vinculado al portafolio", { wabaId: waba, businessId });
    } catch (error) {
      if (isBenignWabaLinkError(error)) {
        shared = true;
        log.info("OBO: WABA ya estaba vinculado", { wabaId: waba, businessId });
      } else {
        log.warn("OBO: no se pudo vincular el WABA al portafolio", {
          wabaId: waba,
          businessId,
          message: error.message,
          code: error.meta?.code || null,
          subcode: error.meta?.subcode || null,
        });
      }
    }
  } else {
    log.warn("OBO: falta META_BUSINESS_ID; no se puede POST client_whatsapp_business_accounts", {
      wabaId: waba,
    });
  }

  let assigned = false;
  try {
    let systemUserId = String(env.meta.systemUserId || "").trim();
    if (!systemUserId) {
      const me = await graphRequest({
        method: "GET",
        path: "me",
        token: platformToken,
        query: { fields: "id" },
      });
      systemUserId = String(me.id || "").trim();
    }
    if (systemUserId) {
      const assignToken = String(plannerAccessToken || "").trim() || platformToken;
      await assignSystemUserToWaba({ wabaId: waba, systemUserId, token: assignToken });
      assigned = true;
      log.info("OBO: system user asignado al WABA", { wabaId: waba, systemUserId });
    }
  } catch (error) {
    if (isBenignWabaLinkError(error)) {
      assigned = true;
      log.info("OBO: system user ya tenía acceso al WABA", { wabaId: waba });
    } else {
      log.warn("OBO: no se pudo asignar el system user", {
        wabaId: waba,
        message: error.message,
        code: error.meta?.code || null,
        subcode: error.meta?.subcode || null,
      });
    }
  }

  if (!shared && !assigned) {
    log.warn("OBO: el token de plataforma no tiene acceso a este WABA; se usará el token del planner", {
      wabaId: waba,
    });
  }
  return { skipped: false, shared, assigned };
}

export async function createMessageTemplate({ wabaId, token, payload }) {
  return graphRequest({
    method: "POST",
    path: `${wabaId}/message_templates`,
    token,
    body: payload,
  });
}

export async function updateMessageTemplate({ templateId, token, payload }) {
  return graphRequest({
    method: "POST",
    path: templateId,
    token,
    body: payload,
  });
}

export async function deleteMessageTemplate({ wabaId, token, name, metaTemplateId }) {
  const hsmId = String(metaTemplateId || "").trim();
  const templateName = String(name || "").trim();
  return graphRequest({
    method: "DELETE",
    path: `${wabaId}/message_templates`,
    token,
    query: hsmId ? { hsm_id: hsmId } : { name: templateName },
  });
}

export async function uploadResumableHeader({ token, fileName, fileLength, fileType, buffer }) {
  const session = await graphRequest({
    method: "POST",
    path: `${env.meta.appId}/uploads`,
    token,
    query: {
      file_name: fileName,
      file_length: fileLength,
      file_type: fileType,
      access_token: token,
    },
    timeoutMs: env.meta.mediaTimeoutMs || 60000,
  });
  const sessionId = String(session.id || "").trim();
  if (!sessionId) throw httpError(502, "Meta no devolvió una sesión de upload.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.meta.mediaTimeoutMs || 60000);
  let res;
  try {
    res = await fetch(`${graphBase()}/${sessionId}`, {
      method: "POST",
      headers: {
        Authorization: `OAuth ${token}`,
        file_offset: "0",
      },
      body: buffer,
      signal: controller.signal,
    });
  } catch (error) {
    const err = httpError(502, "No se pudo contactar la API de Meta.");
    attachMetaError(err, { httpStatus: 502, message: error.message });
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const payload = await parseResponse(res);
  if (!res.ok) throw graphErrorFromResponse(res.status, payload);
  const handle = payload.h || payload.handle;
  if (!handle) throw httpError(502, "Meta no devolvió header_handle.");
  return handle;
}

export async function inspectGraphToken(inputToken) {
  const appId = String(env.meta.appId || "").trim();
  const appSecret = String(env.meta.appSecret || "").trim();
  if (!appId || !appSecret) {
    throw httpError(500, "Faltan META_APP_ID o META_APP_SECRET en el servidor.");
  }
  const payload = await graphRequest({
    method: "GET",
    path: "debug_token",
    token: `${appId}|${appSecret}`,
    query: { input_token: String(inputToken || "").trim() },
  });
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const granular = Array.isArray(data?.granular_scopes) ? data.granular_scopes : [];
  const targetIds = [...new Set(
    granular.flatMap((row) => (Array.isArray(row?.target_ids) ? row.target_ids : [])).map(String),
  )];
  return {
    type: data?.type || null,
    isValid: data?.is_valid !== false,
    expiresAt: data?.expires_at ?? null,
    dataAccessExpiresAt: data?.data_access_expires_at ?? null,
    scopes: Array.isArray(data?.scopes) ? data.scopes : [],
    targetIds,
  };
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
