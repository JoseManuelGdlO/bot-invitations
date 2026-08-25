import { Op } from "sequelize";
import { Event, Guest, OutboundJob } from "../models/index.js";
import { createWhatsAppProvider } from "./whatsapp.adapter.js";
import { env } from "../config/env.js";
import { resolveWhatsappTo } from "../utils/whatsapp-identity.js";
import {
  isBulkKind,
  nextAllowedAt,
  randomIntervalMs,
  rememberNextGap,
  summarizeOwnerSends,
} from "./outbound.throttle.js";

const provider = createWhatsAppProvider();
const DUE_BATCH = 50;
const HOUR_MS = 60 * 60 * 1000;

let running = false;

export async function enqueueJob(type, payload, scheduledAt = new Date()) {
  return OutboundJob.create({ type, payload, scheduledAt, status: "queued" });
}

async function syncWhatsappSendJob(job, { ok }) {
  const guestId = job.payload?.guestId;
  if (!guestId) return;
  const guest = await Guest.findByPk(guestId);
  if (!guest) return;

  if (ok) {
    if (["pendiente", "enviado"].includes(guest.whatsapp)) {
      guest.whatsapp = "enviado";
      await guest.save();
    }
    return;
  }

  if (job.payload?.kind === "campaign" && guest.status === "enviado" && !guest.lastReply) {
    guest.status = "sin_contactar";
    guest.whatsapp = "pendiente";
    guest.contactedAt = null;
    await guest.save();
  }
}

export async function processJob(job) {
  await job.update({ status: "processing", attempts: job.attempts + 1 });
  // Jobs already queued keep sending even if the owner's subscription expired or was canceled.
  try {
    if (job.type === "whatsapp.send") {
      let to = job.payload.to;
      if (job.payload?.guestId) {
        const guest = await Guest.findByPk(job.payload.guestId);
        if (guest) to = resolveWhatsappTo(guest) || to;
      }
      const result = await provider.sendMessage(to, job.payload.text, {
        eventId: job.payload.eventId,
        guestId: job.payload.guestId,
        conversationId: job.payload.conversationId,
      });
      const ok = !result.skipped;
      await job.update({
        status: result.skipped ? "skipped" : "done",
        payload: { ...job.payload, result },
      });
      await syncWhatsappSendJob(job, { ok });
      return;
    }
    await job.update({ status: "skipped", lastError: `Tipo desconocido: ${job.type}` });
  } catch (err) {
    await job.update({ status: "failed", lastError: err.message });
    if (job.type === "whatsapp.send") {
      await syncWhatsappSendJob(job, { ok: false });
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

async function deferQueuedForOwner(eventIds, nextAt, { exceptId = null, bulkOnly = false } = {}) {
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
  for (const job of mine) {
    await job.update({ scheduledAt: nextAt });
  }
  return mine.length;
}

async function processOwnerTick(ownerId, dueJobs) {
  const jobs = sortOwnerJobs(dueJobs);
  const eventIds = await loadOwnerEventIds(ownerId);
  const state = await loadOwnerThrottleState(eventIds);
  const candidate = jobs[0];
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
    const deferred = await deferQueuedForOwner(eventIds, at, {
      bulkOnly: reason === "hourly",
    });
    console.log(
      `[worker] owner ${ownerId} aplazado: ${reason} hasta ${at.toISOString()} (${deferred} jobs)`,
    );
    return;
  }

  await processJob(candidate);
  if (candidate.status !== "done") return;

  const nextAt = new Date(Date.now() + randomIntervalMs(intervalMinMs, intervalMaxMs));
  rememberNextGap(ownerId, nextAt);
  await deferQueuedForOwner(eventIds, nextAt, { exceptId: candidate.id });
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
      const ownerId = ownerByEvent.get(job.payload?.eventId);
      if (!ownerId) {
        unthrottled.push(job);
        continue;
      }
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
    tickWorker().catch((err) => console.error("[worker]", err));
  }, env.workerIntervalMs);
  timer.unref?.();
  const { intervalMinMs, intervalMaxMs, maxPerHour } = env.waSend;
  console.log(
    `[worker] outbound jobs cada ${env.workerIntervalMs}ms; WA ${intervalMinMs}-${intervalMaxMs}ms, máx ${maxPerHour}/h masivos`,
  );
  return timer;
}
