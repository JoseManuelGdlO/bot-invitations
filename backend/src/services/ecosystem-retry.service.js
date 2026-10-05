import { Op } from "sequelize";
import { Guest, OutboundJob, sequelize } from "../models/index.js";
import { env } from "../config/env.js";
import { Logger } from "../utils/logger.js";

const log = new Logger("WhatsApp");

export const ECOSYSTEM_ENGAGEMENT_CODE = 131049;

const RETRY_STATUSES = new Set(["enviado", "reagendado"]);

function retryDelayMs() {
  const n = Number(env.waSend?.ecosystemRetryMs);
  if (!Number.isFinite(n) || n <= 0) return 24 * 60 * 60 * 1000;
  return n;
}

function retryMax() {
  const n = Number(env.waSend?.ecosystemRetryMax);
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.floor(n);
}

function jsonEquals(path, value) {
  // Sequelize trata `$` como reemplazo y lo duplica; la ruta va en un literal.
  return sequelize.where(
    sequelize.literal(`JSON_UNQUOTE(JSON_EXTRACT(\`payload\`, '${path}'))`),
    value,
  );
}

function canRescheduleGuest(guest) {
  if (!guest) return false;
  if (guest.whatsapp === "respondido" || guest.lastReply) return false;
  return RETRY_STATUSES.has(guest.status);
}

async function findQueuedRetry(messageId) {
  return OutboundJob.findOne({
    where: {
      type: "whatsapp.send",
      status: "queued",
      [Op.and]: [jsonEquals("$.ecosystemRetryOf", messageId)],
    },
  });
}

async function findSendJobByProviderId(messageId) {
  return OutboundJob.findOne({
    where: {
      type: "whatsapp.send",
      [Op.and]: [jsonEquals("$.result.providerId", messageId)],
    },
    order: [["updatedAt", "DESC"]],
  });
}

async function markRescheduled(guest) {
  if (guest.status === "reagendado" && guest.whatsapp === "pendiente") return;
  guest.status = "reagendado";
  guest.whatsapp = "pendiente";
  await guest.save();
}

export async function rescheduleEcosystemDelivery({ guest = null, messageId } = {}) {
  const id = String(messageId || "").trim();
  if (!id) return { ok: false };

  const existing = await findQueuedRetry(id);
  const source = existing ? null : await findSendJobByProviderId(id);
  if (!existing && !source?.payload) return { ok: false };

  if (!guest) {
    const guestId = source?.payload?.guestId || existing?.payload?.guestId;
    if (guestId) guest = await Guest.findByPk(guestId);
  }
  if (!canRescheduleGuest(guest)) return { ok: false };

  if (existing) {
    await markRescheduled(guest);
    return { ok: true, alreadyQueued: true, retryAt: existing.scheduledAt || null };
  }

  const previous = Number(source.payload.ecosystemRetryCount) || 0;
  const nextAttempt = previous + 1;
  if (nextAttempt > retryMax()) return { ok: false, exhausted: true };

  const rest = { ...source.payload };
  delete rest.result;
  delete rest.campaignId;
  const scheduledAt = new Date(Date.now() + retryDelayMs());
  await OutboundJob.create({
    type: "whatsapp.send",
    status: "queued",
    scheduledAt,
    payload: {
      ...rest,
      ecosystemRetryOf: id,
      ecosystemRetryCount: nextAttempt,
      guestPatch: {
        ...(rest.guestPatch && typeof rest.guestPatch === "object" ? rest.guestPatch : {}),
        status: "enviado",
        whatsapp: "pendiente",
      },
    },
  });
  await markRescheduled(guest);
  log.info("plantilla reagendada por límite de ecosistema", {
    guestId: guest.id,
    messageId: id,
    attempt: nextAttempt,
    retryAt: scheduledAt.toISOString(),
  });
  return { ok: true, retryAt: scheduledAt, attempt: nextAttempt };
}

export async function cancelEcosystemRetries(guestId, reason = "reenvío cancelado") {
  if (!guestId) return 0;
  const jobs = await OutboundJob.findAll({
    where: {
      type: "whatsapp.send",
      status: "queued",
      [Op.and]: [jsonEquals("$.guestId", guestId)],
    },
  });
  let cancelled = 0;
  for (const job of jobs) {
    if (!job.payload?.ecosystemRetryOf) continue;
    await job.update({ status: "skipped", lastError: reason });
    cancelled += 1;
  }
  if (cancelled) {
    log.info("reenvío de ecosistema cancelado", { guestId, cancelled, reason });
  }
  return cancelled;
}
