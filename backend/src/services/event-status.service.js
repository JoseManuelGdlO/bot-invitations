import { Op } from "sequelize";
import { Event } from "../models/index.js";
import { parseDateOnly, startOfDay } from "./follow-up.service.js";
import { logActivity } from "./activity.service.js";
import { Logger } from "../utils/logger.js";

const log = new Logger("EventStatus");

export function isEventDatePassed(eventDate, now = new Date()) {
  const day = parseDateOnly(eventDate);
  if (!day) return false;
  return startOfDay(now).getTime() > day.getTime();
}

export async function activateEvent(event, { transaction } = {}) {
  if (!event || event.status === "finalizado" || event.status === "activo") return false;
  event.status = "activo";
  await event.save({ transaction });
  return true;
}

export async function finalizePastEvents(now = new Date()) {
  const events = await Event.findAll({
    where: { status: { [Op.in]: ["activo", "borrador"] } },
  });
  let finalized = 0;
  for (const event of events) {
    if (!isEventDatePassed(event.date, now)) continue;
    event.status = "finalizado";
    await event.save();
    await logActivity(event.id, `El evento ${event.name} finalizó`, "system");
    log.info("evento finalizado", { eventId: event.id, date: event.date });
    finalized += 1;
  }
  return finalized;
}
