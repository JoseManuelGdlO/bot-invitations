import { Op } from "sequelize";
import { env } from "../config/env.js";
import { ChannelCredential, ChannelIntegration, WhatsappCredential, WhatsappIntegration } from "../models/index.js";
import { encryptCredentialsPayload } from "../utils/credentials-crypto.js";
import { httpError } from "../utils/http-error.js";
import { Logger } from "../utils/logger.js";
import {
  META_WHATSAPP_PROVIDER,
  WHATSAPP_CHANNEL,
  assertPhoneNumberIdExclusiveToOwner,
  normalizeMetaCredentials,
} from "./integration-resolver.service.js";
import {
  exchangeEmbeddedSignupCode,
  getPhoneNumberDetails,
  initiateCoexistenceSync,
  listWabaPhoneNumbers,
  subscribeWabaApp,
  unsubscribeWabaApp,
} from "./meta-graph.client.js";
import { upsertWhatsappMetaCredentials } from "./whatsapp-meta.service.js";

const log = new Logger("MetaSignup");

export function publicMetaSignupConfig() {
  const appId = String(env.meta.appId || "").trim();
  const configId = String(env.meta.configId || "").trim();
  const graphVersion = String(env.meta.graphVersion || "v22.0");
  return {
    configured: Boolean(appId && configId && env.meta.appSecret),
    appId,
    configId,
    graphVersion,
    featureType: "whatsapp_business_app_onboarding",
    sessionInfoVersion: "3",
  };
}

function pickPhoneFromList(phones, preferredId) {
  if (!phones.length) return null;
  if (preferredId) {
    const match = phones.find((row) => String(row.id) === String(preferredId));
    if (match) return match;
  }
  return phones[0];
}

async function upsertMetaIntegration({ ownerUserId, wabaId, phoneNumberId, displayPhoneNumber, coexistenceEnabled }) {
  const existing = await ChannelIntegration.findOne({
    where: {
      ownerUserId,
      channel: WHATSAPP_CHANNEL,
      provider: META_WHATSAPP_PROVIDER,
    },
  });
  const patch = {
    displayName: displayPhoneNumber ? `WhatsApp ${displayPhoneNumber}` : "WhatsApp Cloud API",
    status: "active",
    lastError: null,
    wabaId,
    phoneNumberId,
    displayPhoneNumber,
    coexistenceEnabled,
  };
  if (!existing) {
    return ChannelIntegration.create({
      ownerUserId,
      channel: WHATSAPP_CHANNEL,
      provider: META_WHATSAPP_PROVIDER,
      ...patch,
    });
  }
  await existing.update(patch);
  return existing;
}

async function replaceMetaCredentials({ ownerUserId, integrationId, payload }) {
  await ChannelCredential.update(
    { isActive: false },
    { where: { ownerUserId, channelIntegrationId: integrationId } },
  );
  await ChannelCredential.create({
    ownerUserId,
    channelIntegrationId: integrationId,
    credentialType: "json_secrets",
    cipherText: encryptCredentialsPayload(payload),
    isActive: true,
  });
}

export async function completeEmbeddedSignup({
  ownerUserId,
  code,
  wabaId,
  phoneNumberId,
  businessId,
  event,
} = {}) {
  const config = publicMetaSignupConfig();
  if (!config.configured) {
    throw httpError(503, "Embedded Signup no está configurado en el servidor.");
  }
  const exchangeCode = String(code || "").trim();
  if (!exchangeCode) throw httpError(400, "Falta el código de Embedded Signup.");

  const coexistenceByEvent = String(event || "").toUpperCase() === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING";
  log.info("embedded signup: intercambiando código", {
    ownerUserId,
    hasWabaId: Boolean(wabaId),
    hasPhoneNumberId: Boolean(phoneNumberId),
    event: event || null,
  });

  const { accessToken } = await exchangeEmbeddedSignupCode(exchangeCode);
  let resolvedWabaId = String(wabaId || "").trim();
  if (!resolvedWabaId) throw httpError(400, "Meta no devolvió el WABA ID. Completa de nuevo el flujo.");

  await subscribeWabaApp(resolvedWabaId, accessToken);
  log.info("embedded signup: WABA suscrita a webhooks", { ownerUserId, wabaId: resolvedWabaId });

  const phones = await listWabaPhoneNumbers(resolvedWabaId, accessToken);
  let phone = pickPhoneFromList(phones, phoneNumberId);
  if (!phone && phoneNumberId) {
    phone = await getPhoneNumberDetails(phoneNumberId, accessToken);
  }
  if (!phone?.id) {
    throw httpError(400, "No se encontró un número de WhatsApp en la cuenta conectada.");
  }

  let details = phone;
  try {
    details = await getPhoneNumberDetails(phone.id, accessToken);
  } catch (error) {
    log.warn("embedded signup: no se pudieron leer detalles del número", {
      phoneNumberId: phone.id,
      message: error.message,
    });
  }

  const coexistenceEnabled =
    coexistenceByEvent || (details.is_on_biz_app === true && details.platform_type === "CLOUD_API");
  const displayPhoneNumber = String(details.display_phone_number || phone.display_phone_number || "").trim() || null;

  await assertPhoneNumberIdExclusiveToOwner({ phoneNumberId: phone.id, ownerUserId });

  const credentials = normalizeMetaCredentials({
    businessId,
    wabaId: resolvedWabaId,
    phoneNumberId: String(phone.id),
    displayPhoneNumber,
    accessToken,
    coexistenceEnabled,
  });

  const integration = await upsertMetaIntegration({
    ownerUserId,
    wabaId: resolvedWabaId,
    phoneNumberId: credentials.phoneNumberId,
    displayPhoneNumber,
    coexistenceEnabled,
  });
  await replaceMetaCredentials({
    ownerUserId,
    integrationId: integration.id,
    payload: credentials,
  });
  await upsertWhatsappMetaCredentials({
    ownerUserId,
    accessToken,
    wabaId: resolvedWabaId,
    phoneNumberId: credentials.phoneNumberId,
    displayPhoneNumber,
  });

  if (coexistenceEnabled) {
    try {
      await initiateCoexistenceSync({
        phoneNumberId: credentials.phoneNumberId,
        token: accessToken,
        syncType: "smb_app_state_sync",
      });
      log.info("embedded signup: sync de contactos iniciado", { phoneNumberId: credentials.phoneNumberId });
    } catch (error) {
      log.warn("embedded signup: sync de coexistence falló", {
        phoneNumberId: credentials.phoneNumberId,
        message: error.message,
        code: error.meta?.code || null,
      });
    }
  }

  log.info("embedded signup: conexión guardada", {
    ownerUserId,
    integrationId: integration.id,
    wabaId: resolvedWabaId,
    phoneNumberId: credentials.phoneNumberId,
    coexistenceEnabled,
  });

  return {
    integration,
    displayPhoneNumber,
    coexistenceEnabled,
    provider: META_WHATSAPP_PROVIDER,
  };
}

export async function disconnectMetaWhatsapp({ ownerUserId }) {
  const integration = await ChannelIntegration.findOne({
    where: {
      ownerUserId,
      channel: WHATSAPP_CHANNEL,
      provider: META_WHATSAPP_PROVIDER,
      status: { [Op.ne]: "eliminated" },
    },
  });
  const metaRow = await WhatsappIntegration.findOne({ where: { ownerUserId } });
  if (!integration && !metaRow) throw httpError(404, "No hay una conexión de Meta para desconectar.");

  let token = "";
  try {
    if (integration) {
      const cred = await ChannelCredential.findOne({
        where: { ownerUserId, channelIntegrationId: integration.id, isActive: true },
      });
      if (cred) {
        const { decryptCredentialsPayload } = await import("../utils/credentials-crypto.js");
        token = String(decryptCredentialsPayload(cred.cipherText)?.accessToken || "").trim();
      }
    }
  } catch {
    token = "";
  }

  const wabaId = integration?.wabaId || metaRow?.wabaId;
  if (token && wabaId) {
    try {
      await unsubscribeWabaApp(wabaId, token);
    } catch (error) {
      log.warn("disconnect: no se pudo desuscribir el WABA", {
        integrationId: integration?.id || metaRow?.id,
        message: error.message,
      });
    }
  }

  if (integration) {
    await ChannelCredential.update(
      { isActive: false },
      { where: { ownerUserId, channelIntegrationId: integration.id } },
    );
    await integration.update({
      status: "disabled",
      lastError: null,
      coexistenceEnabled: false,
    });
  }

  if (metaRow) {
    await WhatsappCredential.update(
      { isActive: false },
      { where: { ownerUserId, whatsappIntegrationId: metaRow.id } },
    );
    await metaRow.update({ status: "disabled" });
  }

  const integrationId = integration?.id || metaRow.id;
  log.info("disconnect: conexión Meta desactivada", { ownerUserId, integrationId });
  return { ok: true, integrationId };
}
