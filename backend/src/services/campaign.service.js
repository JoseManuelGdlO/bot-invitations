import { Op } from "sequelize";
import {
  AiConfig,
  Campaign,
  Event,
  Guest,
  OutboundJob,
  User,
  sequelize,
} from "../models/index.js";
import { httpError } from "../utils/http-error.js";
import { Logger } from "../utils/logger.js";
import { toCampaignSnapshot } from "../utils/serialize.js";
import { parseDateOnly, startOfDay } from "./follow-up.service.js";
import { assertWhatsappReady } from "./integration-resolver.service.js";
import { deliverAiMessage } from "./guest-message.service.js";
import { FALLBACK_OPENING, findTemplate, renderTemplate } from "./templates.service.js";
import { logActivity } from "./activity.service.js";
import { resetOwnerThrottle } from "./outbound.throttle.js";
import { recordCampaignSendResult } from "./campaign-progress.js";
import { activateEvent } from "./event-status.service.js";

const log = new Logger("Campaign");
const ACTIVE_STATUSES = ["queued", "running"];
const WA_RETRY_MS = 5 * 60 * 1000;

function toDateOnlyString(value) {
  if (!value) return null;
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function currentCampaignForEvent(campaigns, eventId) {
  const mine = (Array.isArray(campaigns) ? campaigns : []).filter((row) => row.eventId === eventId);
  return mine.find((row) => ACTIVE_STATUSES.includes(row.status)) || mine[0] || null;
}

export async function findCurrentCampaign(eventId) {
  const active = await Campaign.findOne({
    where: { eventId, status: { [Op.in]: ACTIVE_STATUSES } },
    order: [["createdAt", "DESC"]],
  });
  if (active) return active;
  return Campaign.findOne({
    where: { eventId },
    order: [["createdAt", "DESC"]],
  });
}

export async function getEventCampaignSnapshot(event) {
  const row = await findCurrentCampaign(event.id);
  return toCampaignSnapshot(row);
}

function assertScheduleDate(day, event, now = new Date()) {
  const today = startOfDay(now);
  if (day.getTime() < today.getTime()) {
    throw httpError(400, "La fecha no puede ser anterior a hoy.");
  }
  const eventDay = parseDateOnly(event.date);
  if (eventDay && day.getTime() > eventDay.getTime()) {
    throw httpError(400, "La fecha no puede ser posterior al evento.");
  }
}

function parseScheduleDay(raw) {
  const day = parseDateOnly(raw);
  if (!day) throw httpError(400, "Indica un día válido para programar la campaña.");
  return day;
}

async function findLaunchJob(campaignId, transaction) {
  const jobs = await OutboundJob.findAll({
    where: { type: "campaign.launch", status: "queued" },
    transaction,
  });
  return jobs.find((job) => job.payload?.campaignId === campaignId) || null;
}

async function upsertLaunchJob(campaign, runAt, transaction) {
  const existing = await findLaunchJob(campaign.id, transaction);
  if (existing) {
    existing.scheduledAt = runAt;
    await existing.save({ transaction });
    return existing;
  }
  return OutboundJob.create(
    {
      type: "campaign.launch",
      status: "queued",
      scheduledAt: runAt,
      payload: { eventId: campaign.eventId, campaignId: campaign.id },
    },
    { transaction },
  );
}

export async function planCampaign(event, body = {}, now = new Date()) {
  const mode = String(body?.mode || "now").trim() === "schedule" ? "schedule" : "now";
  const isNow = mode === "now";
  let scheduledDate = startOfDay(now);
  let runAt = now;
  if (event?.status === "finalizado") {
    throw httpError(400, "Este evento ya finalizó. No se puede iniciar una campaña.");
  }

  if (!isNow) {
    scheduledDate = parseScheduleDay(body?.date);
    assertScheduleDate(scheduledDate, event, now);
    runAt = startOfDay(scheduledDate);
  }

  if (isNow) {
    const pending = await Guest.count({ where: { eventId: event.id, status: "sin_contactar" } });
    if (!pending) throw httpError(400, "No hay invitados sin contactar.");
    await assertWhatsappReady(event);
  }

  return sequelize.transaction(async (transaction) => {
    const lockedEvent = await Event.findByPk(event.id, {
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (isNow && lockedEvent) await activateEvent(lockedEvent, { transaction });
    const existing = await Campaign.findOne({
      where: { eventId: event.id, status: { [Op.in]: ACTIVE_STATUSES } },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (existing?.status === "running") {
      const err = httpError(409, "La campaña ya está en curso.");
      err.campaign = toCampaignSnapshot(existing);
      throw err;
    }

    if (existing?.status === "queued") {
      existing.scheduledAt = toDateOnlyString(scheduledDate);
      await existing.save({ transaction });
      await upsertLaunchJob(existing, runAt, transaction);
      log.info("campaña reprogramada", {
        eventId: event.id,
        campaignId: existing.id,
        mode,
        scheduledAt: existing.scheduledAt,
      });
      return toCampaignSnapshot(existing);
    }

    const campaign = await Campaign.create(
      {
        eventId: event.id,
        status: "queued",
        scheduledAt: toDateOnlyString(scheduledDate),
        launchedAt: null,
        total: 0,
        processed: 0,
      },
      { transaction },
    );
    await upsertLaunchJob(campaign, runAt, transaction);
    log.info("campaña planificada", {
      eventId: event.id,
      campaignId: campaign.id,
      mode,
      scheduledAt: campaign.scheduledAt,
    });
    return toCampaignSnapshot(campaign);
  });
}

export async function executeCampaignLaunch(job) {
  const campaignId = job?.payload?.campaignId;
  const campaign = campaignId ? await Campaign.findByPk(campaignId) : null;
  if (!campaign) return {};
  if (campaign.status === "done" || campaign.status === "running") return {};

  const event = await Event.findByPk(campaign.eventId);
  if (!event || event.status === "finalizado") {
    campaign.status = "done";
    await campaign.save();
    return {};
  }

  const guests = await Guest.findAll({ where: { eventId: event.id, status: "sin_contactar" } });
  if (guests.length) {
    try {
      await assertWhatsappReady(event);
    } catch (err) {
      log.info("campaña aplazada: WhatsApp no listo", { eventId: event.id, campaignId: campaign.id });
      return { retryAt: new Date(Date.now() + WA_RETRY_MS), reason: err.message };
    }
  }

  const [claimed] = await Campaign.update(
    { status: "running", launchedAt: new Date() },
    { where: { id: campaign.id, status: "queued" } },
  );
  if (!claimed) return {};
  campaign.status = "running";
  campaign.launchedAt = campaign.launchedAt || new Date();
  await campaign.reload();
  await activateEvent(event);

  resetOwnerThrottle(event.ownerId);
  const ai = await AiConfig.findOne({ where: { eventId: event.id } });
  const opening = await findTemplate(event.id, { category: "Primer contacto" });
  const body = opening?.body || ai?.openingMessage || FALLBACK_OPENING;
  const owner = await User.findByPk(event.ownerId);
  const plannerName = owner?.name || "";
  const now = new Date();
  let claimedCount = 0;
  let missingJobs = 0;

  for (const guest of guests) {
    const [taken] = await Guest.update(
      { status: "enviado", whatsapp: "enviado", contactedAt: now },
      { where: { id: guest.id, status: "sin_contactar" } },
    );
    if (!taken) continue;
    await guest.reload();
    claimedCount += 1;
    const text = renderTemplate(body, event, guest, plannerName);
    try {
      const conv = await deliverAiMessage({
        event,
        guest,
        text,
        kind: "campaign",
        campaignId: campaign.id,
      });
      if (!conv) missingJobs += 1;
    } catch (err) {
      log.error(err.message, { eventId: event.id, guestId: guest.id, campaignId: campaign.id });
      missingJobs += 1;
    }
  }

  campaign.total = claimedCount;
  if (claimedCount === 0) campaign.status = "done";
  await campaign.save();
  for (let i = 0; i < missingJobs; i += 1) {
    await recordCampaignSendResult(campaign.id);
  }
  await logActivity(
    event.id,
    `${ai?.assistantName || "El asistente"} envió ${claimedCount} mensajes iniciales`,
    "message",
  );
  log.info("campaña lanzada", { eventId: event.id, campaignId: campaign.id, launched: claimedCount });
  return {};
}
