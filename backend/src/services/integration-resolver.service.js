import { ChannelCredential, ChannelIntegration } from "../models/index.js";
import { decryptCredentialsPayload } from "../utils/credentials-crypto.js";
import { httpError } from "../utils/http-error.js";
import { env } from "../config/env.js";
import { resolveActiveWhatsappMetaByOwner } from "./whatsapp-meta.service.js";

export const WHATSAPP_PROVIDER = "whatsapp-connect";
export const WHATSAPP_CONNECT_PROVIDER = "whatsapp-connect";
export const META_WHATSAPP_PROVIDER = "meta";
export const WHATSAPP_CHANNEL = "whatsapp";
export const WHATSAPP_PROVIDERS = new Set([WHATSAPP_CONNECT_PROVIDER, META_WHATSAPP_PROVIDER]);

function assertWhatsAppConnectIntegration(integration) {
  if (!integration || integration.status === "eliminated") {
    throw httpError(404, "Integración no encontrada.");
  }
  if (integration.channel !== WHATSAPP_CHANNEL) {
    throw httpError(400, "El canal de la integración debe ser whatsapp.");
  }
  if (integration.provider !== WHATSAPP_CONNECT_PROVIDER) {
    throw httpError(400, "El proveedor debe ser whatsapp-connect.");
  }
}

export function normalizeWcCredentials(payload = {}) {
  return {
    webhookSecret: String(payload.webhookSecret || "").trim(),
    deviceId: String(payload.deviceId || "").trim(),
    tenantId: String(payload.tenantId || "").trim() || null,
  };
}

export function normalizeMetaCredentials(payload = {}) {
  return {
    businessId: String(payload.businessId || payload.metaBusinessId || "").trim() || null,
    wabaId: String(payload.wabaId || "").trim() || null,
    phoneNumberId: String(payload.phoneNumberId || "").trim() || null,
    displayPhoneNumber: String(payload.displayPhoneNumber || "").trim() || null,
    accessToken: String(payload.accessToken || "").trim(),
    coexistenceEnabled: Boolean(payload.coexistenceEnabled),
  };
}

async function getActiveCredentialPayload(ownerUserId, channelIntegrationId) {
  const cred = await ChannelCredential.findOne({
    where: { ownerUserId, channelIntegrationId, isActive: true },
    order: [["updatedAt", "DESC"]],
  });
  if (!cred) throw httpError(400, "No hay credenciales activas para esta integración.");
  try {
    return decryptCredentialsPayload(cred.cipherText);
  } catch {
    throw httpError(400, "Las credenciales activas no se pudieron descifrar.");
  }
}

export async function assertDeviceIdExclusiveToOwner({ deviceId, ownerUserId }) {
  const target = String(deviceId || "").trim();
  if (!target) throw httpError(400, "deviceId es obligatorio.");

  const active = await ChannelCredential.findAll({ where: { isActive: true } });
  for (const cred of active) {
    if (cred.ownerUserId === ownerUserId) continue;
    let payload;
    try {
      payload = decryptCredentialsPayload(cred.cipherText);
    } catch {
      continue;
    }
    if (String(payload.deviceId || "").trim() === target) {
      throw httpError(409, "Este device ya está vinculado a otra cuenta.");
    }
  }
}

export async function resolveWhatsappConnectIntegrationById({ ownerUserId, integrationId }) {
  const integration = await ChannelIntegration.findOne({
    where: { id: integrationId, ownerUserId },
  });
  assertWhatsAppConnectIntegration(integration);
  const credentialsPayload = await getActiveCredentialPayload(ownerUserId, integration.id);
  return {
    integration,
    credentials: normalizeWcCredentials(credentialsPayload),
  };
}

export async function resolveActiveWhatsappConnectByOwner({ ownerUserId }) {
  const integration = await ChannelIntegration.findOne({
    where: {
      ownerUserId,
      channel: WHATSAPP_CHANNEL,
      provider: WHATSAPP_CONNECT_PROVIDER,
      status: "active",
    },
    order: [["updatedAt", "DESC"]],
  });
  if (!integration) throw httpError(400, "No hay una integración de WhatsApp activa.");
  const credentialsPayload = await getActiveCredentialPayload(ownerUserId, integration.id);
  const credentials = normalizeWcCredentials(credentialsPayload);
  if (!credentials.deviceId) throw httpError(400, "La integración de WhatsApp no tiene deviceId.");
  if (!credentials.tenantId) throw httpError(400, "La integración de WhatsApp no tiene tenantId.");
  return { integration, credentials, provider: WHATSAPP_CONNECT_PROVIDER };
}

export async function resolveActiveMetaWhatsappByOwner({ ownerUserId }) {
  const integration = await ChannelIntegration.findOne({
    where: {
      ownerUserId,
      channel: WHATSAPP_CHANNEL,
      provider: META_WHATSAPP_PROVIDER,
      status: "active",
    },
    order: [["updatedAt", "DESC"]],
  });
  if (!integration) throw httpError(400, "No hay una conexión de WhatsApp Cloud API activa.");
  const credentialsPayload = await getActiveCredentialPayload(ownerUserId, integration.id);
  const credentials = normalizeMetaCredentials({
    ...credentialsPayload,
    wabaId: integration.wabaId || credentialsPayload.wabaId,
    phoneNumberId: integration.phoneNumberId || credentialsPayload.phoneNumberId,
    displayPhoneNumber: integration.displayPhoneNumber || credentialsPayload.displayPhoneNumber,
    coexistenceEnabled: integration.coexistenceEnabled || credentialsPayload.coexistenceEnabled,
  });
  if (!credentials.phoneNumberId) throw httpError(400, "La conexión de Meta no tiene phone_number_id.");
  if (!credentials.accessToken) throw httpError(400, "La conexión de Meta no tiene access token.");
  return { integration, credentials, provider: META_WHATSAPP_PROVIDER };
}

export async function resolveActiveWhatsappByOwner({ ownerUserId }) {
  try {
    return await resolveActiveMetaWhatsappByOwner({ ownerUserId });
  } catch (metaErr) {
    if (metaErr?.status && metaErr.status !== 400) throw metaErr;
    return resolveActiveWhatsappConnectByOwner({ ownerUserId });
  }
}

export async function assertWhatsappReady(event) {
  if (!event?.ownerId) throw httpError(400, "WhatsApp (Meta) no está configurado.");
  await resolveActiveWhatsappMetaByOwner(event.ownerId);
  const templateName = String(env.meta?.templateName || "").trim();
  if (!templateName) throw httpError(400, "Falta META_TEMPLATE_NAME.");
}

export async function resolveMetaWhatsappByPhoneNumberId({ phoneNumberId }) {
  const target = String(phoneNumberId || "").trim();
  if (!target) throw httpError(400, "Falta phone_number_id para enrutar el webhook.");

  const byColumn = await ChannelIntegration.findOne({
    where: {
      channel: WHATSAPP_CHANNEL,
      provider: META_WHATSAPP_PROVIDER,
      status: "active",
      phoneNumberId: target,
    },
    order: [["updatedAt", "DESC"]],
  });
  if (byColumn) {
    const credentialsPayload = await getActiveCredentialPayload(byColumn.ownerUserId, byColumn.id);
    return {
      integration: byColumn,
      credentials: normalizeMetaCredentials({
        ...credentialsPayload,
        wabaId: byColumn.wabaId || credentialsPayload.wabaId,
        phoneNumberId: byColumn.phoneNumberId || credentialsPayload.phoneNumberId,
        displayPhoneNumber: byColumn.displayPhoneNumber || credentialsPayload.displayPhoneNumber,
        coexistenceEnabled: byColumn.coexistenceEnabled || credentialsPayload.coexistenceEnabled,
      }),
      provider: META_WHATSAPP_PROVIDER,
    };
  }

  const integrations = await ChannelIntegration.findAll({
    where: { channel: WHATSAPP_CHANNEL, provider: META_WHATSAPP_PROVIDER, status: "active" },
    order: [["updatedAt", "DESC"]],
  });
  for (const integration of integrations) {
    try {
      const payload = await getActiveCredentialPayload(integration.ownerUserId, integration.id);
      const credentials = normalizeMetaCredentials(payload);
      if (credentials.phoneNumberId && credentials.phoneNumberId === target) {
        return { integration, credentials, provider: META_WHATSAPP_PROVIDER };
      }
    } catch {
      // Credenciales inválidas: seguir buscando.
    }
  }

  throw httpError(404, "No hay una conexión Meta activa para este phone_number_id.");
}

export async function assertPhoneNumberIdExclusiveToOwner({ phoneNumberId, ownerUserId }) {
  const target = String(phoneNumberId || "").trim();
  if (!target) throw httpError(400, "phoneNumberId es obligatorio.");

  const others = await ChannelIntegration.findAll({
    where: {
      channel: WHATSAPP_CHANNEL,
      provider: META_WHATSAPP_PROVIDER,
      status: "active",
      phoneNumberId: target,
    },
  });
  if (others.some((row) => row.ownerUserId !== ownerUserId)) {
    throw httpError(409, "Este número de WhatsApp ya está vinculado a otra cuenta.");
  }
}

export async function resolveWhatsappConnectIntegrationByDevice({ deviceId }) {
  const target = String(deviceId || "").trim();
  if (!target) throw httpError(400, "Falta deviceId para enrutar el webhook.");

  const integrations = await ChannelIntegration.findAll({
    where: { channel: WHATSAPP_CHANNEL, provider: WHATSAPP_PROVIDER, status: "active" },
    order: [["updatedAt", "DESC"]],
  });

  for (const integration of integrations) {
    try {
      const payload = await getActiveCredentialPayload(integration.ownerUserId, integration.id);
      const credentials = normalizeWcCredentials(payload);
      if (credentials.deviceId && credentials.deviceId === target) {
        return { integration, credentials };
      }
    } catch {
      // Credenciales inválidas: seguir buscando.
    }
  }

  throw httpError(404, "No hay una integración whatsapp-connect activa para este device.");
}
