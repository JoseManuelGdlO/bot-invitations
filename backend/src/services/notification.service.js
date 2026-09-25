import { Notification } from "../models/index.js";
import { env } from "../config/env.js";
import { Logger } from "../utils/logger.js";
import { sendLaunchNoticeEmail } from "./email.service.js";

const log = new Logger("Notification");

function isUniqueError(err) {
  return err?.name === "SequelizeUniqueConstraintError" || err?.original?.code === "ER_DUP_ENTRY";
}

export function serializeNotification(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    href: row.href || null,
    readAt: row.readAt ? new Date(row.readAt).toISOString() : null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
  };
}

export async function deliverNotice(notice, owner) {
  let row;
  try {
    const [found] = await Notification.findOrCreate({
      where: { dedupeKey: notice.dedupeKey },
      defaults: {
        userId: notice.userId,
        eventId: notice.eventId,
        kind: notice.kind,
        title: notice.title,
        body: notice.body,
        href: notice.href,
        dedupeKey: notice.dedupeKey,
        scheduledFor: notice.scheduledFor,
        readAt: null,
        emailSentAt: null,
      },
    });
    row = found;
  } catch (err) {
    if (!isUniqueError(err)) throw err;
    row = await Notification.findOne({ where: { dedupeKey: notice.dedupeKey } });
    if (!row) throw err;
  }

  if (row.emailSentAt || !owner?.email) return row;

  const link = notice.href ? `${env.clientUrl}${notice.href}` : "";
  try {
    await sendLaunchNoticeEmail({
      to: owner.email,
      name: owner.name,
      title: notice.title,
      body: notice.body,
      link,
    });
    row.emailSentAt = new Date();
    await row.save();
  } catch (err) {
    log.error("no se pudo enviar el aviso por correo", {
      dedupeKey: notice.dedupeKey,
      error: err?.message || String(err),
    });
  }
  return row;
}
