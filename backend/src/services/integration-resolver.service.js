import { ChannelCredential, ChannelIntegration } from "../models/index.js";
import { decryptCredentialsPayload } from "../utils/credentials-crypto.js";
import { httpError } from "../utils/http-error.js";
import { env } from "../config/env.js";
import { resolveActiveWhatsappMetaByOwner } from "./whatsapp-meta.service.js";

export const WHATSAPP_PROVIDER = "whatsapp-connect";
export const WHATSAPP_CHANNEL = "whatsapp";

function assertWhatsAppConnectIntegration(integration) {
  if (!integration || integration.status === "eliminated") {
    throw httpError(404, "Integración no encontrada.");
  }
  if (integration.channel !== WHATSAPP_CHANNEL) {
    throw httpError(400, "El canal de la integración debe ser whatsapp.");
  }
  if (integration.provider !== WHATSAPP_PROVIDER) {
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
      provider: WHATSAPP_PROVIDER,
      status: "active",
    },
    order: [["updatedAt", "DESC"]],
  });
  if (!integration) throw httpError(400, "No hay una integración de WhatsApp activa.");
  const credentialsPayload = await getActiveCredentialPayload(ownerUserId, integration.id);
  const credentials = normalizeWcCredentials(credentialsPayload);
  if (!credentials.deviceId) throw httpError(400, "La integración de WhatsApp no tiene deviceId.");
  if (!credentials.tenantId) throw httpError(400, "La integración de WhatsApp no tiene tenantId.");
  return { integration, credentials };
}

export async function assertWhatsappReady(event) {
  if (!event?.ownerId) throw httpError(400, "WhatsApp (Meta) no está configurado.");
  await resolveActiveWhatsappMetaByOwner(event.ownerId);
  const templateName = String(env.meta?.templateName || "").trim();
  if (!templateName) throw httpError(400, "Falta META_TEMPLATE_NAME.");
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
