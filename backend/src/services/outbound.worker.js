import { Op } from "sequelize";
import { Event, Guest, OutboundJob } from "../models/index.js";
import { createWhatsAppProvider } from "./whatsapp.adapter.js";
import { env } from "../config/env.js";
import { Logger } from "../utils/logger.js";
import { formatWhatsappTo, resolveWhatsappTo } from "../utils/whatsapp-identity.js";
import {
  allocateBulkSlot,
  isBulkKind,
  nextAllowedAt,
  randomIntervalMs,
  rememberNextGap,
  summarizeOwnerSends,
} from "./outbound.throttle.js";
import { recordCampaignSendResult } from "./campaign-progress.js";

const provider = createWhatsAppProvider();
const workerLog = new Logger("Worker");
const waLog = new Logger("WhatsApp");
const DUE_BATCH = 50;
const HOUR_MS = 60 * 60 * 1000;
const UNKNOWN_OWNER = "_unknown";

function sendMeta(job, extra = {}) {
  const payload = job.payload || {};
  return {
    jobId: job.id,
    kind: payload.kind || null,
    eventId: payload.eventId || null,
    guestId: payload.guestId || null,
    chars: String(payload.text || "").length,
    ...extra,
  };
}

let running = false;

export async function enqueueJob(type, payload, scheduledAt) {
  let at = scheduledAt;
  if (at === undefined && type === "whatsapp.send" && isBulkKind(payload?.kind)) {
    let ownerId = null;
    if (payload?.eventId) {
      const event = await Event.findByPk(payload.eventId, { attributes: ["ownerId"] });
      ownerId = event?.ownerId || null;
    }
    at = allocateBulkSlot(ownerId, {
      now: new Date(),
      intervalMinMs: env.waSend.intervalMinMs,
      intervalMaxMs: env.waSend.intervalMaxMs,
    });
  }
  if (at == null) at = new Date();
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

async function syncWhatsappSendJob(job, { ok }) {
  const guestId = job.payload?.guestId;
  if (guestId) {
    const guest = await Guest.findByPk(guestId);
    if (guest) {
      if (ok) {
        if (["pendiente", "enviado"].includes(guest.whatsapp)) {
          guest.whatsapp = "enviado";
          await guest.save();
        }
      } else if (job.payload?.kind === "campaign" && guest.status === "enviado" && !guest.lastReply) {
        guest.status = "sin_contactar";
        guest.whatsapp = "pendiente";
        guest.contactedAt = null;
        await guest.save();
      }
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

async function parkJobsStaggered(jobs, fromMs, intervalMinMs, intervalMaxMs) {
  let at = fromMs;
  for (const job of jobs) {
    at += randomIntervalMs(intervalMinMs, intervalMaxMs);
    await job.update({ scheduledAt: new Date(at) });
  }
  return jobs.length;
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
      await syncWhatsappSendJob(job, { ok });
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
        stack: err.stack,
      }));
      await syncWhatsappSendJob(job, { ok: false });
    } else {
      workerLog.error(`job failed: ${err.message}`, { jobId: job.id, type: job.type, stack: err.stack });
    }
  }
}

function sortOwnerJobs(jobs) {
  return [...jobs].sort((a, b) => {
    const bulkA = isBulkKind(a.payload?.kind) ? 1 : 0;
    const bulkB = isBulkKind(b.payload?.kind) ? 1 : 0;
    if (bulkA !== bulkB) return bulkA - bulkB;
    return new Date(a.scheduledAt) - new Date(b.scheduledAt);
  });
}

async function loadOwnerEventIds(ownerId) {
  const events = await Event.findAll({ where: { ownerId }, attributes: ["id"] });
  return new Set(events.map((event) => event.id));
}

async function loadOwnerThrottleState(eventIds) {
  if (!eventIds.size) {
    return { lastSendAt: null, bulkCount: 0, oldestBulkAt: null };
  }
  const hourAgo = new Date(Date.now() - HOUR_MS);
  const jobs = await OutboundJob.findAll({
    where: {
      type: "whatsapp.send",
      status: "done",
      updatedAt: { [Op.gte]: hourAgo },
    },
    order: [["updatedAt", "ASC"]],
  });
  return summarizeOwnerSends(jobs, eventIds, hourAgo);
}

async function deferQueuedForOwner(eventIds, nextAt, {
  exceptId = null,
  bulkOnly = false,
  intervalMinMs = 0,
  intervalMaxMs = 0,
} = {}) {
  const where = {
    type: "whatsapp.send",
    status: "queued",
    scheduledAt: { [Op.lt]: nextAt },
  };
  if (exceptId) where.id = { [Op.ne]: exceptId };
  const queued = await OutboundJob.findAll({ where });
  const mine = queued.filter((job) => {
    if (!eventIds.has(job.payload?.eventId)) return false;
    if (bulkOnly && !isBulkKind(job.payload?.kind)) return false;
    return true;
  });
  let at = new Date(nextAt).getTime();
  for (const job of mine) {
    await job.update({ scheduledAt: new Date(at) });
    at += randomIntervalMs(intervalMinMs, intervalMaxMs);
  }
  return mine.length;
}

async function processOwnerTick(ownerId, dueJobs) {
  const jobs = sortOwnerJobs(dueJobs);
  const candidate = jobs[0];
  if (!candidate) return;
  const eventIds = await loadOwnerEventIds(ownerId);
  const state = await loadOwnerThrottleState(eventIds);
  const { intervalMinMs, intervalMaxMs, maxPerHour } = env.waSend;
  const { at, reason } = nextAllowedAt({
    now: new Date(),
    ownerId,
    lastSendAt: state.lastSendAt,
    intervalMinMs,
    intervalMaxMs,
    isBulk: isBulkKind(candidate.payload?.kind),
    bulkCount: state.bulkCount,
    maxPerHour,
    oldestBulkAt: state.oldestBulkAt,
  });

  if (at && at.getTime() > Date.now()) {
    const farGap = reason === "gap" && at.getTime() - Date.now() > intervalMaxMs;
    if (!farGap) {
      const deferred = await deferQueuedForOwner(eventIds, at, {
        bulkOnly: reason === "hourly",
        intervalMinMs,
        intervalMaxMs,
      });
      workerLog.info(
        `owner ${ownerId} aplazado: ${reason} hasta ${at.toISOString()} (${deferred} jobs)`,
      );
      return;
    }
    workerLog.warn(`owner ${ownerId} ignora gap lejano ${at.toISOString()}`);
  }

  const parked = await parkJobsStaggered(jobs.slice(1), Date.now(), intervalMinMs, intervalMaxMs);
  if (parked) {
    workerLog.info(`owner ${ownerId} apartó ${parked} jobs para no enviar en paralelo`);
  }

  await processJob(candidate);

  const nextAt = new Date(Date.now() + randomIntervalMs(intervalMinMs, intervalMaxMs));
  rememberNextGap(ownerId, nextAt);
  const deferred = await deferQueuedForOwner(eventIds, nextAt, {
    exceptId: candidate.id,
    intervalMinMs,
    intervalMaxMs,
  });
  workerLog.info(
    `owner ${ownerId} gap ${candidate.status} hasta ${nextAt.toISOString()} (${deferred} jobs)`,
  );
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

    const byOwner = new Map();
    const unthrottled = [];
    for (const job of due) {
      if (job.type !== "whatsapp.send") {
        unthrottled.push(job);
        continue;
      }
      const ownerId = ownerByEvent.get(job.payload?.eventId) || UNKNOWN_OWNER;
      const list = byOwner.get(ownerId) || [];
      list.push(job);
      byOwner.set(ownerId, list);
    }

    for (const job of unthrottled) {
      await processJob(job);
    }
    for (const [ownerId, jobs] of byOwner) {
      await processOwnerTick(ownerId, jobs);
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
  const { intervalMinMs, intervalMaxMs, maxPerHour } = env.waSend;
  workerLog.info(
    `outbound jobs cada ${env.workerIntervalMs}ms; WA ${intervalMinMs}-${intervalMaxMs}ms, máx ${maxPerHour}/h masivos`,
  );
  return timer;
}
