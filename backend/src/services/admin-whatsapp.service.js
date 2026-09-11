import { Op } from "sequelize";
import {
  ChannelCredential,
  ChannelIntegration,
  WhatsappCredential,
  WhatsappIntegration,
} from "../models/index.js";
import { META_WHATSAPP_PROVIDER, WHATSAPP_CHANNEL } from "./integration-resolver.service.js";
import { decryptCredentialsPayload } from "../utils/credentials-crypto.js";
import { httpError } from "../utils/http-error.js";
import { Logger } from "../utils/logger.js";

const log = new Logger("AdminWhatsApp");

function trimOrEmpty(value) {
  return String(value || "").trim();
}

function decryptAccessToken(cipherText) {
  try {
    const payload = decryptCredentialsPayload(cipherText);
    return trimOrEmpty(payload?.accessToken);
  } catch {
    throw httpError(400, "Las credenciales de WhatsApp no se pudieron descifrar.");
  }
}

function tokenPayload({ integration, accessToken, source }) {
  return {
    wabaId: integration.wabaId,
    ownerUserId: integration.ownerUserId,
    phoneNumberId: integration.phoneNumberId || null,
    displayPhoneNumber: integration.displayPhoneNumber || null,
    accessToken,
    source,
  };
}

export async function getMetaAccessTokenByWabaId(wabaId) {
  const target = trimOrEmpty(wabaId);
  if (!target) throw httpError(400, "wabaId es obligatorio.");

  const channel = await ChannelIntegration.findOne({
    where: {
      wabaId: target,
      channel: WHATSAPP_CHANNEL,
      provider: META_WHATSAPP_PROVIDER,
      status: { [Op.ne]: "eliminated" },
    },
    order: [["updatedAt", "DESC"]],
  });
  if (channel) {
    const cred = await ChannelCredential.findOne({
      where: { ownerUserId: channel.ownerUserId, channelIntegrationId: channel.id, isActive: true },
      order: [["updatedAt", "DESC"]],
    });
    if (cred) {
      const accessToken = decryptAccessToken(cred.cipherText);
      if (accessToken) {
        log.info("admin: token de WABA leído", {
          wabaId: target,
          ownerUserId: channel.ownerUserId,
          source: "channel_credentials",
        });
        return tokenPayload({ integration: channel, accessToken, source: "channel_credentials" });
      }
    }
  }

  const integration = await WhatsappIntegration.findOne({
    where: { wabaId: target },
    order: [["updatedAt", "DESC"]],
  });
  if (integration) {
    const cred = await WhatsappCredential.findOne({
      where: {
        ownerUserId: integration.ownerUserId,
        whatsappIntegrationId: integration.id,
        isActive: true,
      },
      order: [["updatedAt", "DESC"]],
    });
    if (cred) {
      const accessToken = decryptAccessToken(cred.cipherText);
      if (accessToken) {
        log.info("admin: token de WABA leído", {
          wabaId: target,
          ownerUserId: integration.ownerUserId,
          source: "whatsapp_credentials",
        });
        return tokenPayload({ integration, accessToken, source: "whatsapp_credentials" });
      }
    }
  }

  throw httpError(404, "No hay una conexión de WhatsApp (Meta) para ese WABA.");
}
