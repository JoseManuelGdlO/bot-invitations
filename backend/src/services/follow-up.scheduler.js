import { Op } from "sequelize";
import { AiConfig, Conversation, Event, Guest, User } from "../models/index.js";
import { assertWhatsappReady } from "./integration-resolver.service.js";
import { deliverAiMessage } from "./guest-message.service.js";
import { resolveReminderText, resolveSeguimientoText } from "./templates.service.js";
import { logActivity } from "./activity.service.js";
import {
  computeFollowUpDueAt,
  findIndecisoFollowUpRule,
  formatFollowUpDate,
  INDECISO_NUDGE_ID,
  isDue,
  isIndecisoFollowUpRule,
  isLaunchFollowUpRule,
  nextActiveFollowUpDate,
  parseDateOnly,
} from "./follow-up.service.js";
import { Logger } from "../utils/logger.js";
import { finalizePastEvents } from "./event-status.service.js";

const log = new Logger("FollowUp");

const DRIP_OPEN_STATUSES = [
  "enviado",
  "entregado",
  "respondio",
  "en_conversacion",
  "sin_respuesta",
];

const OPEN_STATUSES = [...DRIP_OPEN_STATUSES, "seguimiento"];

let running = false;

const MAX_SENDS_PER_TICK = 5;

function sentIds(guest) {
  return Array.isArray(guest.followUpsSent) ? [...guest.followUpsSent] : [];
}

function markFollowUpsSent(guest, sent) {
  guest.followUpsSent = sent;
  if (typeof guest.changed === "function") guest.changed("followUpsSent", true);
}

async function processIndecisoNudges(event, guests, paused, plannerName, budget, now, indecisoRule) {
  if (indecisoRule && indecisoRule.active === false) return;
  for (const guest of guests) {
    if (budget.left <= 0) return;
    if (guest.status !== "seguimiento") continue;
    if (paused.has(guest.id) || !guest.phone) continue;
    const sent = sentIds(guest);
    if (sent.includes(INDECISO_NUDGE_ID)) continue;
    const due = parseDateOnly(guest.followUp);
    if (!due || !isDue(due, now)) continue;

    const text = await resolveSeguimientoText(event, guest, plannerName);
    await deliverAiMessage({
      event,
      guest,
      text,
      kind: "seguimiento",
      followUpId: INDECISO_NUDGE_ID,
    });

    sent.push(INDECISO_NUDGE_ID);
    markFollowUpsSent(guest, sent);
    guest.followUp = "";
    await guest.save();
    await logActivity(event.id, `Recontacto de seguimiento a ${guest.rep}`, "message");
    log.info("seguimiento disparado", {
      eventId: event.id,
      guestId: guest.id,
      ruleId: INDECISO_NUDGE_ID,
    });
    budget.left -= 1;
  }
}

async function processDripReminders(event, guests, paused, plannerName, budget, now, rules) {
  if (!rules.length) return;
  for (const guest of guests) {
    if (budget.left <= 0) return;
    if (guest.status === "seguimiento") continue;
    if (paused.has(guest.id) || !guest.phone) continue;
    const sent = sentIds(guest);
    for (const rule of rules) {
      if (!rule?.id || sent.includes(rule.id)) continue;
      const due = computeFollowUpDueAt(rule, {
        contactedAt: guest.contactedAt,
        eventDate: event.date,
      });
      if (!due || !isDue(due, now)) continue;

      const text = await resolveReminderText(event, guest, plannerName);
      await deliverAiMessage({
        event,
        guest,
        text,
        kind: "follow_up",
        followUpId: rule.id,
      });

      sent.push(rule.id);
      markFollowUpsSent(guest, sent);
      const nextDue = nextActiveFollowUpDate(rules, {
        contactedAt: guest.contactedAt,
        eventDate: event.date,
        now,
        alreadySent: sent,
      });
      guest.followUp = nextDue ? formatFollowUpDate(nextDue) : guest.followUp;
      await guest.save();
      await logActivity(event.id, `Recordatorio automático (${rule.label}) a ${guest.rep}`, "message");
      log.info("recordatorio disparado", {
        eventId: event.id,
        guestId: guest.id,
        ruleId: rule.id,
      });
      budget.left -= 1;
      break;
    }
  }
}

async function processEventFollowUps(event, budget) {
  if (budget.left <= 0) return;
  const ai = await AiConfig.findOne({ where: { eventId: event.id } });
  if (!ai) return;

  try {
    await assertWhatsappReady(event);
  } catch {
    return;
  }

  const guests = await Guest.findAll({
    where: { eventId: event.id, status: { [Op.in]: OPEN_STATUSES } },
  });
  if (!guests.length) return;

  const convs = await Conversation.findAll({
    where: { guestId: guests.map((g) => g.id) },
    attributes: ["guestId", "aiPaused"],
  });
  const paused = new Set(convs.filter((c) => c.aiPaused).map((c) => c.guestId));
  const owner = await User.findByPk(event.ownerId);
  const plannerName = owner?.name || "";
  const now = new Date();

  const followUps = Array.isArray(ai.followUps) ? ai.followUps : [];
  await processIndecisoNudges(
    event,
    guests,
    paused,
    plannerName,
    budget,
    now,
    findIndecisoFollowUpRule(followUps),
  );

  const rules = followUps.filter(
    (rule) => rule?.active && !isLaunchFollowUpRule(rule) && !isIndecisoFollowUpRule(rule),
  );
  await processDripReminders(event, guests, paused, plannerName, budget, now, rules);
}

export async function tickFollowUps() {
  if (running) return;
  running = true;
  try {
    await finalizePastEvents();
    const events = await Event.findAll({ where: { status: "activo" } });
    const budget = { left: MAX_SENDS_PER_TICK };
    for (const event of events) {
      try {
        await processEventFollowUps(event, budget);
      } catch (err) {
        log.error(err.message, { eventId: event.id });
      }
    }
  } finally {
    running = false;
  }
}

export function startFollowUpScheduler(intervalMs) {
  const timer = setInterval(() => {
    tickFollowUps().catch((err) => log.error(err.message, { stack: err.stack }));
  }, intervalMs);
  timer.unref?.();
  log.info(`follow-ups cada ${intervalMs}ms`);
  return timer;
}
