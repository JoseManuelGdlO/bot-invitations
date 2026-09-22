import { env } from "../config/env.js";
import {
  Event,
  EventWhatsappTemplate,
  WhatsappMessageTemplate,
} from "../models/index.js";
import { asyncHandler } from "../utils/async.js";
import { httpError } from "../utils/http-error.js";
import { Logger } from "../utils/logger.js";
import { resolveOpeningDocumentFilePath } from "../services/opening-document.service.js";
import { resolveOwnerCampaignSendContext } from "../services/whatsapp-templates.service.js";
import { metaClient, sanitizeMetaBodyParam } from "../services/meta.client.js";
import {
  findWhatsappMetaStatusByOwner,
  parseWhatsappMetaCredentials,
  resolveActiveWhatsappMetaByOwner,
  upsertWhatsappMetaCredentials,
} from "../services/whatsapp-meta.service.js";
import { getOwnerPricingAnalytics } from "../services/meta-pricing-analytics.service.js";
import { waitForTestDelivery } from "../services/whatsapp-test-delivery.js";
import { summarizeMetaErrors, userFacingMetaCodeMessage } from "../utils/meta-error.js";

const log = new Logger("WhatsApp");

function requestHeader(req, name) {
  if (typeof req.get === "function") {
    const value = req.get(name);
    if (value) return String(value).split(",")[0].trim();
  }
  const headers = req.headers || {};
  const raw = headers[name] || headers[String(name).toLowerCase()];
  if (raw == null || raw === "") return "";
  return String(Array.isArray(raw) ? raw[0] : raw).split(",")[0].trim();
}

function isDevEnv() {
  return env.nodeEnv !== "production";
}

function assertTestDeliveryOk(status) {
  if (!status || String(status.status || "").toLowerCase() !== "failed") return;
  const errors = summarizeMetaErrors(status.errors);
  throw httpError(
    400,
    userFacingMetaCodeMessage(errors[0]?.code, "WhatsApp no pudo enviar el mensaje de prueba."),
  );
}

function metaWebhookUrl(req) {
  if (!isDevEnv()) return null;
  const proto = requestHeader(req, "x-forwarded-proto") || req.protocol || "http";
  const host = requestHeader(req, "x-forwarded-host") || requestHeader(req, "host");
  if (!host) return "/api/webhooks/meta";
  return `${proto}://${host}/api/webhooks/meta`;
}

async function resolveSendHeaderMedia(headerMedia, credentials, type = "document") {
  if (!headerMedia) return null;
  const filename = String(headerMedia.filename || headerMedia.fileName || "").trim();
  const existingId = String(headerMedia.id || "").trim();
  if (existingId) {
    return { id: existingId, ...(filename ? { filename } : {}) };
  }
  const filePath = resolveOpeningDocumentFilePath({
    ...headerMedia,
    eventId: headerMedia.eventId,
  });
  if (!filePath) {
    const label = type === "image" ? "imagen" : "documento";
    throw httpError(400, `La plantilla con ${label} requiere un archivo adjunto.`);
  }
  const mediaId = await metaClient.uploadDocument({
    filePath,
    filename,
    mime: headerMedia.mime,
    accessToken: credentials.accessToken,
    phoneNumberId: credentials.phoneNumberId,
  });
  return { id: mediaId, ...(filename ? { filename } : {}) };
}

async function templateStatus(ownerUserId, wabaId) {
  const currentWabaId = String(wabaId || "").trim();
  const templateLanguage = String(env.meta?.templateLanguage || "es_MX").trim() || "es_MX";
  if (!currentWabaId) {
    return {
      hasTemplate: false,
      templateName: null,
      templateDisplayName: null,
      templateLanguage,
    };
  }
  const [count, campaignLink] = await Promise.all([
    WhatsappMessageTemplate.count({ where: { ownerUserId, wabaId: currentWabaId } }),
    EventWhatsappTemplate.findOne({
      where: { isCampaign: true },
      include: [
        { model: Event, required: true, where: { ownerId: ownerUserId } },
        {
          model: WhatsappMessageTemplate,
          as: "template",
          required: true,
          where: { ownerUserId, wabaId: currentWabaId, purpose: "invitation" },
        },
      ],
    }),
  ]);
  return {
    hasTemplate: count > 0,
    templateName: campaignLink?.template?.name || null,
    templateDisplayName: campaignLink?.template?.displayName || null,
    templateLanguage,
  };
}

export const getWhatsappMetaStatus = asyncHandler(async (req, res) => {
  const owner = await findWhatsappMetaStatusByOwner(req.user.id);
  const template = await templateStatus(req.user.id, owner.wabaId);
  res.json({
    provider: "meta-cloud",
    configured: owner.configured,
    wabaId: owner.wabaId,
    phoneNumberId: owner.phoneNumberId,
    displayPhoneNumber: owner.displayPhoneNumber,
    ...template,
    webhookUrl: metaWebhookUrl(req),
  });
});

export const postWhatsappMetaCredentials = asyncHandler(async (req, res) => {
  const parsed = parseWhatsappMetaCredentials(req.body || {});
  const { integration } = await upsertWhatsappMetaCredentials({
    ownerUserId: req.user.id,
    ...parsed,
  });
  const template = await templateStatus(req.user.id, integration.wabaId);
  log.info("credentials upsert", { ownerUserId: req.user.id, phoneNumberId: integration.phoneNumberId });
  res.status(201).json({
    ok: true,
    provider: "meta-cloud",
    configured: true,
    wabaId: integration.wabaId,
    phoneNumberId: integration.phoneNumberId,
    displayPhoneNumber: integration.displayPhoneNumber || null,
    ...template,
  });
});

export const getWhatsappMetaTemplate = asyncHandler(async (req, res) => {
  const templateName = String(req.query?.templateName || req.body?.templateName || "").trim();
  if (!templateName) throw httpError(400, "Falta el nombre de la plantilla de WhatsApp.");
  const { credentials } = await resolveActiveWhatsappMetaByOwner(req.user.id);
  const template = await metaClient.getMessageTemplate({
    accessToken: credentials.accessToken,
    wabaId: credentials.wabaId,
    templateName,
  });
  res.json(template);
});

export const getWhatsappPricingAnalytics = asyncHandler(async (req, res) => {
  const data = await getOwnerPricingAnalytics({
    ownerUserId: req.user.id,
    range: req.query?.range,
  });
  res.json(data);
});

export const postWhatsappMetaSendTest = asyncHandler(async (req, res) => {
  const to = String(req.body?.to || "").trim();
  const type = String(req.body?.type || "text").trim().toLowerCase();
  const text = String(req.body?.text || "").trim();

  if (type !== "text" && type !== "template") {
    throw httpError(400, "type debe ser text o template.");
  }

  const { credentials } = await resolveActiveWhatsappMetaByOwner(req.user.id);

  let payload;
  if (type === "template") {
    const ctx = await resolveOwnerCampaignSendContext({
      ownerUserId: req.user.id,
      wabaId: credentials.wabaId,
    });
    const bodyParams = (ctx.hsmExampleParams || [])
      .map((value) => sanitizeMetaBodyParam(value))
      .filter((value) => value != null && String(value).length > 0);
    if (!bodyParams.length) {
      throw httpError(400, "La plantilla de campaña no tiene variables de ejemplo para la prueba.");
    }
    const headerDocument = await resolveSendHeaderMedia(ctx.hsmHeaderDocument, credentials);
    const headerImage = await resolveSendHeaderMedia(ctx.hsmHeaderImage, credentials, "image");
    payload = await metaClient.sendTemplateWithRetry({
      to,
      bodyParams,
      accessToken: credentials.accessToken,
      phoneNumberId: credentials.phoneNumberId,
      templateName: ctx.hsmTemplateName,
      ...(headerDocument ? { headerDocument } : {}),
      ...(headerImage ? { headerImage: { id: headerImage.id } } : {}),
    });
  } else {
    if (!text || text.length > 4096) throw httpError(400, "El texto de prueba es obligatorio.");
    payload = await metaClient.sendTextWithRetry({
      to,
      text,
      accessToken: credentials.accessToken,
      phoneNumberId: credentials.phoneNumberId,
    });
  }

  const messageId = payload?.messages?.[0]?.id || payload?.id || null;
  if (type === "text" && messageId) {
    const delivery = await waitForTestDelivery(messageId);
    assertTestDeliveryOk(delivery);
  }

  log.info("send-test", { type, ownerUserId: req.user.id });
  res.status(202).json({
    ok: true,
    type,
    id: messageId,
  });
});
