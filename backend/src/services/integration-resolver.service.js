import { ChannelCredential, ChannelIntegration } from "../models/index.js";
import { decryptCredentialsPayload } from "../utils/credentials-crypto.js";
import { httpError } from "../utils/http-error.js";

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
  return { integration, credentials };
}

export async function assertWhatsappReady(event) {
  if (!event?.ownerId) throw httpError(400, "No hay una integración de WhatsApp activa.");
  await resolveActiveWhatsappConnectByOwner({ ownerUserId: event.ownerId });
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
