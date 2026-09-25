import { Op } from "sequelize";
import { AiConfig, Campaign, Conversation, Event, Guest, User } from "../models/index.js";
import { Logger } from "../utils/logger.js";
import { addDays, startOfDay } from "./follow-up.service.js";
import { collectLaunchNotices, dateKey, DRIP_OPEN_STATUSES } from "./launch-notice.js";
import { deliverNotice } from "./notification.service.js";

const log = new Logger("LaunchNotice");
const GUEST_STATUSES = [...DRIP_OPEN_STATUSES, "seguimiento"];
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

let running = false;

export async function tickLaunchNotices(now = new Date()) {
  if (running) return;
  running = true;
  try {
    const today = startOfDay(now);
    const keys = [dateKey(today), dateKey(addDays(today, 1))];
    const campaigns = await Campaign.findAll({
      where: { status: "queued", scheduledAt: { [Op.in]: keys } },
    });
    const activeEvents = await Event.findAll({ where: { status: "activo" } });
    const known = new Set(activeEvents.map((event) => event.id));
    const extraIds = [...new Set(campaigns.map((row) => row.eventId).filter((id) => id && !known.has(id)))];
    const extraEvents = extraIds.length
      ? await Event.findAll({ where: { id: { [Op.in]: extraIds }, status: { [Op.ne]: "finalizado" } } })
      : [];
    const events = [...activeEvents, ...extraEvents];
    const activeIds = activeEvents.map((event) => event.id);
    const aiRows = activeIds.length
      ? await AiConfig.findAll({ where: { eventId: { [Op.in]: activeIds } } })
      : [];
    const guests = activeIds.length
      ? await Guest.findAll({
          where: { eventId: { [Op.in]: activeIds }, status: { [Op.in]: GUEST_STATUSES } },
        })
      : [];
    const guestIds = guests.map((guest) => guest.id);
    const pausedRows = guestIds.length
      ? await Conversation.findAll({
          where: { guestId: { [Op.in]: guestIds }, aiPaused: true },
          attributes: ["guestId"],
        })
      : [];
    const notices = collectLaunchNotices({
      events,
      campaigns,
      aiByEventId: new Map(aiRows.map((ai) => [ai.eventId, ai])),
      guests,
      pausedGuestIds: new Set(pausedRows.map((row) => row.guestId)),
      now,
    });
    if (!notices.length) return;

    const owners = await User.findAll({
      where: { id: { [Op.in]: [...new Set(notices.map((notice) => notice.userId))] } },
    });
    const ownerById = new Map(owners.map((user) => [user.id, user]));
    for (const notice of notices) {
      try {
        await deliverNotice(notice, ownerById.get(notice.userId) || null);
      } catch (err) {
        log.error(err.message, { dedupeKey: notice.dedupeKey });
      }
    }
  } finally {
    running = false;
  }
}

export function startLaunchNoticeScheduler(intervalMs = DEFAULT_INTERVAL_MS) {
  const run = () => {
    tickLaunchNotices().catch((err) => log.error(err.message, { stack: err.stack }));
  };
  const boot = setTimeout(run, 10_000);
  const timer = setInterval(run, intervalMs);
  boot.unref?.();
  timer.unref?.();
  log.info(`avisos de lanzamiento cada ${intervalMs}ms`);
  return timer;
}
