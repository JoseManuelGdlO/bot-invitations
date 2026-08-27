import { asyncHandler } from "../utils/async.js";
import { httpError } from "../utils/http-error.js";
import { wcClient } from "../services/wc.client.js";
import { runWithWcToken } from "../services/wc-auth.js";
import { resolveWhatsappConnectIntegrationById } from "../services/integration-resolver.service.js";
import { Logger } from "../utils/logger.js";

const log = new Logger("WhatsApp");

function requireUuid(value, field = "integrationId") {
  const id = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw httpError(400, `${field} inválido.`);
  }
  return id;
}

async function getIntegrationContext(integrationId, ownerUserId) {
  const { integration, credentials } = await resolveWhatsappConnectIntegrationById({
    integrationId,
    ownerUserId,
  });
  if (integration.status !== "active") throw httpError(400, "La integración debe estar activa.");
  if (!credentials.deviceId) throw httpError(400, "Faltan credenciales de deviceId.");
  if (!credentials.tenantId) throw httpError(400, "Falta tenantId en las credenciales. Vuelve a guardar la conexión.");
  return { integration, credentials };
}

export const postWhatsappConnectQrLink = asyncHandler(async (req, res) => {
  const integrationId = requireUuid(req.body?.integrationId);
  const { credentials } = await getIntegrationContext(integrationId, req.user.id);

  const result = await runWithWcToken(async () => {
    await wcClient.connectDevice({ deviceId: credentials.deviceId, tenantId: credentials.tenantId });
    return wcClient.createPublicLink({ deviceId: credentials.deviceId, tenantId: credentials.tenantId });
  });

  res.json({
    url: result.url,
    expiresAt: result.expiresAt || new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  });
});

export const getWhatsappConnectDeviceStatus = asyncHandler(async (req, res) => {
  const integrationId = requireUuid(req.query?.integrationId);
  const { credentials } = await getIntegrationContext(integrationId, req.user.id);
  const result = await runWithWcToken(() =>
    wcClient.getDeviceStatus({ deviceId: credentials.deviceId, tenantId: credentials.tenantId }),
  );
  res.json(result);
});

export const postWhatsappConnectSendTest = asyncHandler(async (req, res) => {
  const integrationId = requireUuid(req.body?.integrationId);
  const to = String(req.body?.to || "").trim();
  if (to.length < 5 || to.length > 40) throw httpError(400, "El destinatario no es válido.");

  const type = String(req.body?.type || "text").trim().toLowerCase();
  const text = String(req.body?.text || "").trim();
  const imageUrl = String(req.body?.imageUrl || "").trim();
  const caption = String(req.body?.caption || "").trim();

  let messagePayload;
  if (type === "image") {
    if (!imageUrl) throw httpError(400, "imageUrl es obligatorio cuando type=image.");
    try {
      new URL(imageUrl);
    } catch {
      throw httpError(400, "imageUrl no es una URL válida.");
    }
    messagePayload = { to, type: "image", imageUrl, ...(caption ? { caption } : {}) };
  } else {
    if (!text || text.length > 4096) throw httpError(400, "El texto de prueba es obligatorio.");
    messagePayload = { to, type: "text", text };
  }

  const { credentials } = await getIntegrationContext(integrationId, req.user.id);
  await runWithWcToken(() =>
    wcClient.sendMessageWithRetry({
      deviceId: credentials.deviceId,
      ...messagePayload,
      tenantId: credentials.tenantId,
    }),
  );
  log.info("send-test", { integrationId });
  res.status(202).json({ ok: true });
});
