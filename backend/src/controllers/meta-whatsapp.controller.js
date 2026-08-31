import { asyncHandler } from "../utils/async.js";
import { verifyMetaWebhook } from "./whatsapp-connect-webhook.controller.js";
import { assertMetaWebhookSignature, processMetaWhatsappWebhook } from "../services/meta-webhook.service.js";
import { completeEmbeddedSignup, disconnectMetaWhatsapp, publicMetaSignupConfig } from "../services/meta-signup.service.js";
import { ChannelCredential, ChannelIntegration } from "../models/index.js";
import { META_WHATSAPP_PROVIDER, WHATSAPP_CHANNEL } from "../services/integration-resolver.service.js";
import { Logger } from "../utils/logger.js";

const log = new Logger("MetaWhatsApp");

function parseJsonBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const raw = typeof req.rawBody === "string" ? req.rawBody : Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

export const getMetaWhatsappWebhook = verifyMetaWebhook;

export async function postMetaWhatsappWebhook(req, res, next) {
  try {
    const rawBody = assertMetaWebhookSignature(req);
    const payload = parseJsonBody({ ...req, rawBody });
    const result = await processMetaWhatsappWebhook({ payload, rawBody });
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    if (error.status === 401) return next(error);
    log.error("webhook POST falló", { message: error.message, code: error.meta?.code || null });
    next(error);
  }
}

async function metaIntegrationDto(row) {
  const activeCred = await ChannelCredential.findOne({
    where: { ownerUserId: row.ownerUserId, channelIntegrationId: row.id, isActive: true },
  });
  return {
    id: row.id,
    channel: row.channel,
    provider: row.provider,
    displayName: row.displayName,
    status: row.status,
    webhookUrl: row.webhookUrl,
    lastHealthcheckAt: row.lastHealthcheckAt,
    lastError: row.lastError,
    hasActiveCredential: Boolean(activeCred),
    wabaId: row.wabaId || null,
    phoneNumberId: row.phoneNumberId || null,
    displayPhoneNumber: row.displayPhoneNumber || null,
    coexistenceEnabled: Boolean(row.coexistenceEnabled),
  };
}

export const getMetaSignupConfig = asyncHandler(async (_req, res) => {
  res.json(publicMetaSignupConfig());
});

export const postMetaEmbeddedSignup = asyncHandler(async (req, res) => {
  const result = await completeEmbeddedSignup({
    ownerUserId: req.user.id,
    code: req.body?.code,
    wabaId: req.body?.wabaId || req.body?.waba_id,
    phoneNumberId: req.body?.phoneNumberId || req.body?.phone_number_id,
    businessId: req.body?.businessId || req.body?.business_id,
    event: req.body?.event,
  });
  res.status(201).json(await metaIntegrationDto(result.integration));
});

export const postMetaDisconnect = asyncHandler(async (req, res) => {
  const result = await disconnectMetaWhatsapp({ ownerUserId: req.user.id });
  const row = await ChannelIntegration.findOne({
    where: {
      id: result.integrationId,
      ownerUserId: req.user.id,
      channel: WHATSAPP_CHANNEL,
      provider: META_WHATSAPP_PROVIDER,
    },
  });
  res.json(row ? await metaIntegrationDto(row) : { ok: true, ...result });
});
