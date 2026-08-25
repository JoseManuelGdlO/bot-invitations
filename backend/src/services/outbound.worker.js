import { Op } from "sequelize";
import { Guest, OutboundJob } from "../models/index.js";
import { createWhatsAppProvider } from "./whatsapp.adapter.js";
import { env } from "../config/env.js";

const provider = createWhatsAppProvider();

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
      const result = await provider.sendMessage(job.payload.to, job.payload.text, {
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

export async function tickWorker() {
  const jobs = await OutboundJob.findAll({
    where: { status: "queued", scheduledAt: { [Op.lte]: new Date() } },
    order: [["scheduledAt", "ASC"]],
    limit: 20,
  });
  for (const job of jobs) {
    await processJob(job);
  }
}

export function startOutboundWorker() {
  const timer = setInterval(() => {
    tickWorker().catch((err) => console.error("[worker]", err));
  }, env.workerIntervalMs);
  timer.unref?.();
  console.log(`[worker] outbound jobs cada ${env.workerIntervalMs}ms`);
  return timer;
}
