import { Op } from "sequelize";
import { ChannelCredential, ChannelIntegration } from "../models/index.js";
import { asyncHandler } from "../utils/async.js";
import { decryptCredentialsPayload, encryptCredentialsPayload } from "../utils/credentials-crypto.js";
import { httpError } from "../utils/http-error.js";
import { WHATSAPP_CHANNEL, WHATSAPP_PROVIDER } from "../services/integration-resolver.service.js";

const ELIMINATED_STATUS = "eliminated";
const USER_STATUSES = new Set(["draft", "active", "error", "disabled"]);

function ownerWhere(userId) {
  return { ownerUserId: userId };
}

function visibleIntegrationsWhere(userId) {
  return {
    ...ownerWhere(userId),
    status: { [Op.ne]: ELIMINATED_STATUS },
  };
}

export function resolveCreateIntegrationOutcome(existing, body) {
  if (!existing) return { kind: "create" };
  if (existing.status === ELIMINATED_STATUS) {
    return {
      kind: "reactivate",
      patch: {
        status: body.status ?? "draft",
        displayName: body.displayName !== undefined ? body.displayName : existing.displayName,
        webhookUrl: body.webhookUrl !== undefined ? body.webhookUrl : existing.webhookUrl,
        lastError: null,
      },
    };
  }
  return { kind: "conflict" };
}

async function findOwnedIntegrationOr404(userId, id) {
  const row = await ChannelIntegration.findOne({
    where: { id, ...visibleIntegrationsWhere(userId) },
  });
  if (!row) throw httpError(404, "Integración no encontrada.");
  return row;
}

async function integrationDto(row) {
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
  };
}

function parseCreateBody(body = {}) {
  const channel = String(body.channel || WHATSAPP_CHANNEL).trim();
  const provider = String(body.provider || WHATSAPP_PROVIDER).trim();
  if (channel !== WHATSAPP_CHANNEL) throw httpError(400, "Solo se admite el canal WhatsApp.");
  if (provider !== WHATSAPP_PROVIDER) throw httpError(400, "El proveedor debe ser whatsapp-connect.");
  const displayName = body.displayName == null ? null : String(body.displayName).trim().slice(0, 160) || null;
  const webhookUrl = body.webhookUrl == null ? null : String(body.webhookUrl).trim().slice(0, 500) || null;
  const status = body.status ? String(body.status) : "draft";
  if (!USER_STATUSES.has(status)) throw httpError(400, "Estado de integración inválido.");
  return { channel, provider, displayName, webhookUrl, status };
}

function parsePatchBody(body = {}) {
  const patch = {};
  if (body.displayName !== undefined) {
    patch.displayName = body.displayName == null ? null : String(body.displayName).trim().slice(0, 160) || null;
  }
  if (body.webhookUrl !== undefined) {
    patch.webhookUrl = body.webhookUrl == null ? null : String(body.webhookUrl).trim().slice(0, 500) || null;
  }
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!USER_STATUSES.has(status)) throw httpError(400, "Estado de integración inválido.");
    patch.status = status;
  }
  return patch;
}

function parseWhatsappCredentials(payload = {}) {
  const deviceId = String(payload.deviceId || "").trim();
  const webhookSecret = String(payload.webhookSecret || "").trim();
  const tenantId = String(payload.tenantId || "").trim() || null;
  if (!deviceId || !webhookSecret) {
    throw httpError(400, "deviceId y webhookSecret son obligatorios.");
  }
  return { deviceId, webhookSecret, tenantId };
}

export const listIntegrations = asyncHandler(async (req, res) => {
  const rows = await ChannelIntegration.findAll({
    where: visibleIntegrationsWhere(req.user.id),
    order: [["updatedAt", "DESC"]],
  });
  res.json(await Promise.all(rows.map((row) => integrationDto(row))));
});

export const createIntegration = asyncHandler(async (req, res) => {
  const body = parseCreateBody(req.body);
  const existing = await ChannelIntegration.findOne({
    where: {
      ownerUserId: req.user.id,
      channel: body.channel,
      provider: body.provider,
    },
  });
  const outcome = resolveCreateIntegrationOutcome(existing, body);
  if (outcome.kind === "conflict") {
    throw httpError(409, "Ya existe una integración para este canal y proveedor.");
  }
  if (outcome.kind === "reactivate") {
    await existing.update(outcome.patch);
    return res.status(201).json(await integrationDto(existing));
  }
  const row = await ChannelIntegration.create({
    ownerUserId: req.user.id,
    channel: body.channel,
    provider: body.provider,
    displayName: body.displayName,
    status: body.status,
    webhookUrl: body.webhookUrl,
  });
  res.status(201).json(await integrationDto(row));
});

export const patchIntegration = asyncHandler(async (req, res) => {
  const row = await findOwnedIntegrationOr404(req.user.id, req.params.id);
  const body = parsePatchBody(req.body || {});
  await row.update(body);
  res.json(await integrationDto(row));
});

export const deleteIntegration = asyncHandler(async (req, res) => {
  const row = await findOwnedIntegrationOr404(req.user.id, req.params.id);
  await row.update({ status: ELIMINATED_STATUS });
  res.json({ ok: true });
});

export const postIntegrationCredentials = asyncHandler(async (req, res) => {
  const row = await findOwnedIntegrationOr404(req.user.id, req.params.id);
  const rawPayload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : req.body || {};
  const payload =
    row.channel === WHATSAPP_CHANNEL && row.provider === WHATSAPP_PROVIDER
      ? parseWhatsappCredentials(rawPayload)
      : rawPayload;
  const cipherText = encryptCredentialsPayload(payload);

  await ChannelCredential.update(
    { isActive: false },
    { where: { ownerUserId: req.user.id, channelIntegrationId: row.id } },
  );
  await ChannelCredential.create({
    ownerUserId: req.user.id,
    channelIntegrationId: row.id,
    credentialType: "json_secrets",
    cipherText,
    isActive: true,
  });
  await row.update({ status: "active", lastError: null });
  res.status(201).json({ ok: true, hasActiveCredential: true });
});

export const postIntegrationTest = asyncHandler(async (req, res) => {
  const row = await findOwnedIntegrationOr404(req.user.id, req.params.id);
  const cred = await ChannelCredential.findOne({
    where: { ownerUserId: req.user.id, channelIntegrationId: row.id, isActive: true },
  });
  if (!cred) throw httpError(400, "No hay credenciales activas para probar.");
  try {
    decryptCredentialsPayload(cred.cipherText);
    await row.update({
      lastHealthcheckAt: new Date(),
      lastError: null,
      status: row.status === "error" ? "active" : row.status,
    });
    res.json({ ok: true, message: "Las credenciales se descifraron correctamente." });
  } catch (e) {
    await row.update({
      lastHealthcheckAt: new Date(),
      lastError: e?.message || "Decrypt failed",
      status: "error",
    });
    throw httpError(400, "La prueba de credenciales falló.");
  }
});
