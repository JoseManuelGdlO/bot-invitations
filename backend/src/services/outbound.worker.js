import { Op } from "sequelize";
import { Event, Guest, Message, OutboundJob } from "../models/index.js";
import { createWhatsAppProvider, isColdConversation } from "./whatsapp.adapter.js";
import { env } from "../config/env.js";
import { Logger } from "../utils/logger.js";
import { formatWhatsappTo, resolveWhatsappTo } from "../utils/whatsapp-identity.js";
import {
  countInitialConversations,
  DAY_MS,
  isBulkKind,
  nextInitialRetryAt,
} from "./outbound.throttle.js";
import { recordCampaignSendResult } from "./campaign-progress.js";

const provider = createWhatsAppProvider();
const workerLog = new Logger("Worker");
const waLog = new Logger("WhatsApp");
const DUE_BATCH = 50;
const UNKNOWN_OWNER = "_unknown";

function sendMeta(job, extra = {}) {
  const payload = job.payload || {};
  return {
    jobId: job.id,
    kind: payload.kind || null,
    eventId: payload.eventId || null,
    guestId: payload.guestId || null,
    chars: String(payload.text || "").length,
    hsmTemplateName: payload.hsmTemplateName || null,
    hasDocument: Boolean(payload.hsmHeaderDocument),
    ...extra,
  };
}

let running = false;

export async function enqueueJob(type, payload, scheduledAt) {
  const at = scheduledAt ?? new Date();
  const job = await OutboundJob.create({ type, payload, scheduledAt: at, status: "queued" });
  workerLog.debug(`encolado ${type}`, {
    jobId: job.id,
    kind: payload?.kind || null,
    eventId: payload?.eventId || null,
    guestId: payload?.guestId || null,
    chars: String(payload?.text || "").length,
    scheduledAt: at instanceof Date ? at.toISOString() : at,
  });
  return job;
}

async function maybeRecordCampaignProgress(job) {
  if (job.payload?.kind !== "campaign") return;
  await recordCampaignSendResult(job.payload?.campaignId);
}

async function persistOutboundProviderId(job, result) {
  const providerId = String(result?.providerId || "").trim();
  const conversationId = job.payload?.conversationId;
  if (!providerId || !conversationId) return;
  const message = await Message.findOne({
    where: { conversationId, from: "ai" },
    order: [["createdAt", "DESC"]],
  });
  if (!message || message.providerId) return;
  message.providerId = providerId;
  await message.save();
}

async function syncWhatsappSendJob(job, { ok, result } = {}) {
  if (ok) await persistOutboundProviderId(job, result);
  const guestId = job.payload?.guestId;
  if (guestId) {
    const guest = await Guest.findByPk(guestId);
    if (guest && !ok && job.payload?.kind === "campaign" && guest.status === "enviado" && !guest.lastReply) {
      guest.status = "sin_contactar";
      guest.whatsapp = "pendiente";
      guest.contactedAt = null;
      await guest.save();
    }
  }
  await maybeRecordCampaignProgress(job);
}

function skipWhatsappSendReason(payload) {
  if (!String(payload?.text || "").trim()) return "texto vacío";
  if (!String(payload?.to || "").trim()) return "sin destinatario";
  return null;
}

async function claimQueuedJob(job) {
  if (job.id) {
    const [claimed] = await OutboundJob.update(
      { status: "processing", attempts: (job.attempts || 0) + 1 },
      { where: { id: job.id, status: "queued" } },
    );
    if (!claimed) return false;
    job.status = "processing";
    job.attempts = (job.attempts || 0) + 1;
    return true;
  }
  await job.update({ status: "processing", attempts: job.attempts + 1 });
  return true;
}

export async function processJob(job) {
  const claimed = await claimQueuedJob(job);
  if (!claimed) {
    workerLog.debug(`job ${job.id} omitido: ya no está queued`);
    return;
  }
  let to = null;
  // Jobs already queued keep sending even if the owner's subscription expired or was canceled.
  try {
    if (job.type === "campaign.launch") {
      const { executeCampaignLaunch } = await import("./campaign.service.js");
      const result = await executeCampaignLaunch(job);
      if (result?.retryAt) {
        await job.update({
          status: "queued",
          scheduledAt: result.retryAt,
          lastError: result.reason || null,
        });
        workerLog.info("campaign.launch aplazado", {
          jobId: job.id,
          eventId: job.payload?.eventId,
          campaignId: job.payload?.campaignId,
          retryAt: result.retryAt instanceof Date ? result.retryAt.toISOString() : result.retryAt,
        });
        return;
      }
      await job.update({ status: "done" });
      workerLog.info("campaign.launch done", {
        jobId: job.id,
        eventId: job.payload?.eventId,
        campaignId: job.payload?.campaignId,
      });
      return;
    }
    if (job.type === "whatsapp.send") {
      const skip = skipWhatsappSendReason(job.payload);
      if (skip) {
        await job.update({ status: "skipped", lastError: skip });
        waLog.info(`whatsapp.send skipped: ${skip}`, sendMeta(job, { status: "skipped", reason: skip }));
        await maybeRecordCampaignProgress(job);
        return;
      }
      to = formatWhatsappTo(job.payload.to);
      if (job.payload?.guestId) {
        const guest = await Guest.findByPk(job.payload.guestId);
        if (guest) to = resolveWhatsappTo(guest) || to;
      }
      waLog.info("enviando whatsapp.send", sendMeta(job, { to }));
      const result = await provider.sendMessage(to, job.payload.text, {
        eventId: job.payload.eventId,
        guestId: job.payload.guestId,
        conversationId: job.payload.conversationId,
        hsmParams: job.payload.hsmParams,
        hsmTemplateName: job.payload.hsmTemplateName,
        hsmHeaderDocument: job.payload.hsmHeaderDocument,
      });
      const ok = !result.skipped;
      const status = result.skipped ? "skipped" : "done";
      await job.update({
        status,
        payload: { ...job.payload, result },
      });
      waLog.info(ok ? "whatsapp.send done" : "whatsapp.send skipped", sendMeta(job, {
        status,
        to,
        ...(result.skipped && { reason: "provider skipped" }),
      }));
      await syncWhatsappSendJob(job, { ok, result });
      return;
    }
    await job.update({ status: "skipped", lastError: `Tipo desconocido: ${job.type}` });
    workerLog.info(`job skipped: tipo desconocido ${job.type}`, { jobId: job.id, status: "skipped" });
  } catch (err) {
    await job.update({ status: "failed", lastError: err.message });
    if (job.type === "whatsapp.send") {
      waLog.error(`whatsapp.send failed: ${err.message}`, sendMeta(job, {
        status: "failed",
        to,
        error: err.message,
        ...(err.meta && { meta: err.meta }),
        stack: err.stack,
      }));
      await syncWhatsappSendJob(job, { ok: false });
    } else {
      workerLog.error(`job failed: ${err.message}`, { jobId: job.id, type: job.type, stack: err.stack });
    }
  }
}

async function wouldStartConversation(job) {
  if (!isBulkKind(job.payload?.kind)) return false;
  const guestId = job.payload?.guestId;
  if (!guestId) return true;
  const guest = await Guest.findByPk(guestId);
  if (guest?.status === "sin_contactar") return true;
  return await isColdConversation(guestId);
}

async function loadOwnerEventIds(ownerId) {
  if (!ownerId || ownerId === UNKNOWN_OWNER) return new Set();
  const events = await Event.findAll({ where: { ownerId }, attributes: ["id"] });
  return new Set(events.map((event) => event.id));
}

async function loadOwnerInitialState(ownerId, eventIds) {
  if (!eventIds.size) return { count: 0, oldestAt: null };
  const since = new Date(Date.now() - DAY_MS);
  const jobs = await OutboundJob.findAll({
    where: {
      type: "whatsapp.send",
      status: "done",
      updatedAt: { [Op.gte]: since },
    },
    order: [["updatedAt", "ASC"]],
  });
  return countInitialConversations(jobs, eventIds, since);
}

export async function tickWorker() {
  if (running) return;
  running = true;
  try {
    const due = await OutboundJob.findAll({
      where: { status: "queued", scheduledAt: { [Op.lte]: new Date() } },
      order: [["scheduledAt", "ASC"]],
      limit: DUE_BATCH,
    });
    if (!due.length) return;

    const eventIds = [...new Set(due.map((job) => job.payload?.eventId).filter(Boolean))];
    const events = eventIds.length
      ? await Event.findAll({ where: { id: eventIds }, attributes: ["id", "ownerId"] })
      : [];
    const ownerByEvent = new Map(events.map((event) => [event.id, event.ownerId]));
    const ownerState = new Map();
    const ownerEvents = new Map();
    const max = Number(env.waSend?.maxInitialPer24h) || 0;

    async function stateFor(ownerId) {
      if (ownerState.has(ownerId)) return ownerState.get(ownerId);
      let ids = ownerEvents.get(ownerId);
      if (!ids) {
        ids = await loadOwnerEventIds(ownerId);
        ownerEvents.set(ownerId, ids);
      }
      const state = await loadOwnerInitialState(ownerId, ids);
      ownerState.set(ownerId, state);
      return state;
    }

    for (const job of due) {
      if (job.type !== "whatsapp.send") {
        await processJob(job);
        continue;
      }
      const ownerId = ownerByEvent.get(job.payload?.eventId) || UNKNOWN_OWNER;
      const starts = await wouldStartConversation(job);
      if (starts && max > 0) {
        const state = await stateFor(ownerId);
        if (state.count >= max) {
          const retryAt = nextInitialRetryAt(state.oldestAt);
          await job.update({
            status: "queued",
            scheduledAt: retryAt,
            lastError: "tope 24h conversaciones iniciales",
          });
          workerLog.info(`owner ${ownerId} aplazado: tope 24h hasta ${retryAt.toISOString()}`, {
            jobId: job.id,
            count: state.count,
            max,
          });
          continue;
        }
      }
      await processJob(job);
      if (starts && max > 0 && job.status === "done" && job.payload?.result?.conversationStarted) {
        const state = await stateFor(ownerId);
        state.count += 1;
        if (!state.oldestAt) state.oldestAt = job.updatedAt || new Date();
      }
    }
  } finally {
    running = false;
  }
}

export function startOutboundWorker() {
  const timer = setInterval(() => {
    tickWorker().catch((err) => workerLog.error(err.message, { stack: err.stack }));
  }, env.workerIntervalMs);
  timer.unref?.();
  const max = env.waSend?.maxInitialPer24h;
  workerLog.info(
    `outbound jobs cada ${env.workerIntervalMs}ms; máx ${max || "∞"} conversaciones iniciales / 24h`,
  );
  return timer;
}
