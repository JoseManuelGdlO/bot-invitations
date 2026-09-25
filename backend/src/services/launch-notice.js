import {
  addDays,
  computeFollowUpDueAt,
  isIndecisoFollowUpRule,
  isLaunchFollowUpRule,
  parseDateOnly,
  startOfDay,
} from "./follow-up.service.js";

export const DRIP_OPEN_STATUSES = ["enviado", "entregado", "en_conversacion"];

export function dateKey(value) {
  const day = value instanceof Date ? startOfDay(value) : parseDateOnly(value);
  if (!day) return null;
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");
  return `${day.getFullYear()}-${month}-${date}`;
}

export function isWithinLaunchNotice(due, now = new Date()) {
  const day = due instanceof Date ? startOfDay(due) : parseDateOnly(due);
  if (!day) return false;
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const time = day.getTime();
  return time === today.getTime() || time === tomorrow.getTime();
}

function whenLead(due, now) {
  return startOfDay(due).getTime() === startOfDay(now).getTime() ? "Hoy" : "Mañana";
}

function sentIds(guest) {
  return Array.isArray(guest.followUpsSent) ? guest.followUpsSent : [];
}

export function collectLaunchNotices({
  events = [],
  campaigns = [],
  aiByEventId = new Map(),
  guests = [],
  pausedGuestIds = new Set(),
  now = new Date(),
} = {}) {
  const eventById = new Map(events.map((event) => [event.id, event]));
  const notices = [];

  for (const campaign of campaigns) {
    if (campaign.status !== "queued" || !campaign.scheduledAt) continue;
    const due = parseDateOnly(campaign.scheduledAt);
    if (!due || !isWithinLaunchNotice(due, now)) continue;
    const event = eventById.get(campaign.eventId);
    if (!event || event.status === "finalizado" || !event.ownerId) continue;
    const key = dateKey(due);
    notices.push({
      userId: event.ownerId,
      eventId: event.id,
      kind: "campaign",
      title: "Campaña por lanzarse",
      body: `La campaña de «${event.name}» se lanza ${whenLead(due, now).toLowerCase()}.`,
      href: `/eventos/${event.slug}/resumen`,
      dedupeKey: `campaign:${campaign.id}:${key}`,
      scheduledFor: key,
    });
  }

  for (const event of events) {
    if (event.status !== "activo" || !event.ownerId) continue;
    const ai = aiByEventId.get(event.id);
    if (!ai || ai.followUpsEnabled === false) continue;
    const rules = (Array.isArray(ai.followUps) ? ai.followUps : []).filter(
      (rule) => rule?.active && rule.id && !isLaunchFollowUpRule(rule),
    );
    const indeciso = rules.find(isIndecisoFollowUpRule);
    const drip = rules.filter((rule) => !isIndecisoFollowUpRule(rule));
    const eventGuests = guests.filter((guest) => guest.eventId === event.id && guest.phone);
    const groups = new Map();

    const add = (kind, rule, due) => {
      const key = `${kind}:${event.id}:${rule.id}:${dateKey(due)}`;
      const current = groups.get(key) || { kind, rule, due, count: 0 };
      current.count += 1;
      groups.set(key, current);
    };

    for (const guest of eventGuests) {
      if (pausedGuestIds.has(guest.id)) continue;
      const sent = sentIds(guest);
      if (guest.status === "seguimiento" && indeciso && !sent.includes(indeciso.id)) {
        const due = parseDateOnly(guest.followUp);
        if (due && isWithinLaunchNotice(due, now)) add("followup", indeciso, due);
      }
      if (!DRIP_OPEN_STATUSES.includes(guest.status)) continue;
      for (const rule of drip) {
        if (sent.includes(rule.id)) continue;
        const due = computeFollowUpDueAt(rule, {
          contactedAt: guest.contactedAt,
          eventDate: event.date,
        });
        if (!due || !isWithinLaunchNotice(due, now)) continue;
        add("reminder", rule, due);
      }
    }

    for (const group of groups.values()) {
      const lead = whenLead(group.due, now);
      const verb = group.count === 1 ? "enviará" : "enviarán";
      const noun =
        group.kind === "followup"
          ? group.count === 1
            ? "recontacto"
            : "recontactos"
          : group.count === 1
            ? "recordatorio"
            : "recordatorios";
      notices.push({
        userId: event.ownerId,
        eventId: event.id,
        kind: group.kind,
        title: group.kind === "followup" ? "Seguimiento por lanzarse" : "Recordatorio por lanzarse",
        body: `${lead} se ${verb} ${group.count} ${noun} «${group.rule.label}» en «${event.name}».`,
        href: `/eventos/${event.slug}/automatizacion`,
        dedupeKey: `${group.kind}:${event.id}:${group.rule.id}:${dateKey(group.due)}`,
        scheduledFor: dateKey(group.due),
      });
    }
  }

  return notices;
}
