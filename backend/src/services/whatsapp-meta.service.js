import { Op } from "sequelize";
import { WhatsappCredential, WhatsappIntegration } from "../models/index.js";
import { decryptCredentialsPayload, encryptCredentialsPayload } from "../utils/credentials-crypto.js";
import { httpError } from "../utils/http-error.js";

const ACTIVE_STATUS = "active";
const CREDENTIAL_TYPE = "meta_system_user_token";

function trimOrEmpty(value) {
  return String(value || "").trim();
}

function trimOrNull(value) {
  if (value == null) return null;
  return String(value).trim() || null;
}

async function getActiveCredentialPayload(ownerUserId, whatsappIntegrationId) {
  const cred = await WhatsappCredential.findOne({
    where: { ownerUserId, whatsappIntegrationId, isActive: true },
    order: [["updatedAt", "DESC"]],
  });
  if (!cred) throw httpError(400, "WhatsApp (Meta) no está configurado.");
  try {
    return decryptCredentialsPayload(cred.cipherText);
  } catch {
    throw httpError(400, "Las credenciales de WhatsApp no se pudieron descifrar.");
  }
}

function credentialsFrom(integration, payload) {
  const accessToken = trimOrEmpty(payload?.accessToken);
  if (!accessToken) throw httpError(400, "WhatsApp (Meta) no está configurado.");
  return {
    accessToken,
    phoneNumberId: String(integration.phoneNumberId || "").trim(),
    wabaId: String(integration.wabaId || "").trim(),
    displayPhoneNumber: integration.displayPhoneNumber || null,
  };
}

export function parseWhatsappMetaCredentials(body = {}) {
  const accessToken = trimOrEmpty(body.accessToken);
  const wabaId = trimOrEmpty(body.wabaId);
  const phoneNumberId = trimOrEmpty(body.phoneNumberId);
  const displayPhoneNumber = trimOrNull(body.displayPhoneNumber);
  if (!accessToken) throw httpError(400, "accessToken es obligatorio.");
  if (!wabaId) throw httpError(400, "wabaId es obligatorio.");
  if (!phoneNumberId) throw httpError(400, "phoneNumberId es obligatorio.");
  return { accessToken, wabaId, phoneNumberId, displayPhoneNumber };
}

export async function upsertWhatsappMetaCredentials({
  ownerUserId,
  accessToken,
  wabaId,
  phoneNumberId,
  displayPhoneNumber,
}) {
  const parsed = parseWhatsappMetaCredentials({
    accessToken,
    wabaId,
    phoneNumberId,
    displayPhoneNumber,
  });

  const conflict = await WhatsappIntegration.findOne({
    where: {
      phoneNumberId: parsed.phoneNumberId,
      ownerUserId: { [Op.ne]: ownerUserId },
    },
  });
  if (conflict) {
    throw httpError(409, "Este número de WhatsApp ya está vinculado a otra cuenta.");
  }

  let integration = await WhatsappIntegration.findOne({ where: { ownerUserId } });
  if (!integration) {
    integration = await WhatsappIntegration.create({
      ownerUserId,
      wabaId: parsed.wabaId,
      phoneNumberId: parsed.phoneNumberId,
      displayPhoneNumber: parsed.displayPhoneNumber,
      status: ACTIVE_STATUS,
      lastError: null,
    });
  } else {
    await integration.update({
      wabaId: parsed.wabaId,
      phoneNumberId: parsed.phoneNumberId,
      displayPhoneNumber: parsed.displayPhoneNumber,
      status: ACTIVE_STATUS,
      lastError: null,
    });
  }

  await WhatsappCredential.update(
    { isActive: false },
    { where: { ownerUserId, whatsappIntegrationId: integration.id } },
  );
  await WhatsappCredential.create({
    ownerUserId,
    whatsappIntegrationId: integration.id,
    credentialType: CREDENTIAL_TYPE,
    cipherText: encryptCredentialsPayload({ accessToken: parsed.accessToken }),
    isActive: true,
  });

  return { integration, hasActiveCredential: true };
}

export async function findWhatsappMetaStatusByOwner(ownerUserId) {
  const integration = await WhatsappIntegration.findOne({
    where: { ownerUserId, status: ACTIVE_STATUS },
  });
  if (!integration) {
    return {
      configured: false,
      wabaId: null,
      phoneNumberId: null,
      displayPhoneNumber: null,
    };
  }
  const cred = await WhatsappCredential.findOne({
    where: {
      ownerUserId,
      whatsappIntegrationId: integration.id,
      isActive: true,
    },
  });
  return {
    configured: Boolean(cred),
    wabaId: integration.wabaId || null,
    phoneNumberId: integration.phoneNumberId || null,
    displayPhoneNumber: integration.displayPhoneNumber || null,
  };
}

export async function resolveActiveWhatsappMetaByOwner(ownerUserId) {
  const id = String(ownerUserId || "").trim();
  if (!id) throw httpError(400, "WhatsApp (Meta) no está configurado.");
  const integration = await WhatsappIntegration.findOne({
    where: { ownerUserId: id, status: ACTIVE_STATUS },
  });
  if (!integration) throw httpError(400, "WhatsApp (Meta) no está configurado.");
  const payload = await getActiveCredentialPayload(id, integration.id);
  return {
    integration,
    credentials: credentialsFrom(integration, payload),
  };
}

export async function resolveActiveWhatsappMetaByPhoneNumberId(phoneNumberId) {
  const target = trimOrEmpty(phoneNumberId);
  if (!target) return null;
  const integration = await WhatsappIntegration.findOne({
    where: { phoneNumberId: target, status: ACTIVE_STATUS },
  });
  if (!integration) return null;
  const payload = await getActiveCredentialPayload(integration.ownerUserId, integration.id);
  return {
    integration,
    credentials: credentialsFrom(integration, payload),
  };
}
