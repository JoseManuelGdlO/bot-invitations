import type {
  ActivityItem,
  EventData,
  EventItem,
  FollowUpRule,
  Guest,
} from "./mock/types";

export type EventOpsKind = "campaign" | "reminder" | "system";

export interface EventOpsItem {
  id: string;
  eventId: string;
  text: string;
  at: string;
  kind: EventOpsKind;
  sortAt: number;
}

export interface UpcomingReminder {
  id: string;
  eventId: string;
  eventName: string;
  label: string;
  when: string;
  dateLabel: string;
  detail: string;
  status: "upcoming" | "sent" | "waiting";
  sortAt: number;
}

const REPLIED = new Set([
  "confirmado",
  "parcial",
  "no_asistira",
  "en_conversacion",
  "seguimiento",
]);

function hasReplied(guest: Guest) {
  return (
    REPLIED.has(guest.status) ||
    guest.whatsapp === "respondido" ||
    Boolean(guest.lastReply?.trim())
  );
}

function replyLabel(awaiting: number, total: number) {
  if (awaiting === 0) return total === 1 ? "Ya contestó" : "Ya contestaron";
  if (awaiting === 1) return "1 pendiente de contestar";
  return `${awaiting} pendientes de contestar`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = startOfDay(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const iso = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const dmy = String(value).match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return startOfDay(parsed);
}

function formatDay(date: Date) {
  return date.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatRelative(date: Date, now = new Date()) {
  const diff = now.getTime() - date.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return formatDay(date);
}

function isLaunchRule(rule: FollowUpRule) {
  return rule.id === "f1" || /primer contacto/i.test(rule.label);
}

function isIndecisoRule(rule: FollowUpRule) {
  return rule.id === "indeciso" || /indeciso|recontacto/i.test(rule.label);
}

function ruleAnchor(rule: FollowUpRule): "contactedAt" | "eventDate" | "seguimiento" | null {
  const text = rule.when
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (text.includes("despues del primer contacto") || text.includes("despues de primer contacto")) {
    return "contactedAt";
  }
  if (text.includes("despues de marcar seguimiento") || text.includes("despues del seguimiento")) {
    return "seguimiento";
  }
  if (text.includes("antes del evento")) return "eventDate";
  if (isIndecisoRule(rule)) return "seguimiento";
  if (rule.id === "f2" || rule.id === "f3") return "contactedAt";
  if (rule.id === "f4") return "eventDate";
  return null;
}

function mapLoggedActivity(item: ActivityItem, now: Date): EventOpsItem | null {
  const text = item.text.toLowerCase();
  if (item.kind === "confirm" || item.kind === "reject") return null;
  if (/confirm[oó]|no podr[aá] asistir|escalad/.test(text)) return null;

  let label: string | null = null;
  let kind: EventOpsKind = "system";
  if (/recordatorio/.test(text)) {
    label = "Recordatorio lanzado";
    kind = "reminder";
  } else if (/seguimiento|recontacto/.test(text)) {
    label = "Seguimiento lanzado";
    kind = "reminder";
  } else if (/mensajes iniciales|campa[nñ]a/.test(text)) {
    label = "Campaña lanzada";
    kind = "campaign";
  } else if (/importaron|cre[oó] el evento|finaliz[oó]|program/.test(text)) {
    label = item.text;
    kind = "system";
  }
  if (!label) return null;

  return {
    id: `log-${item.id}`,
    eventId: item.eventId,
    text: label,
    at: item.at,
    kind,
    sortAt: now.getTime(),
  };
}

export function buildEventOps(
  events: EventItem[],
  activity: ActivityItem[],
  now = new Date(),
): EventOpsItem[] {
  const items: EventOpsItem[] = [];

  for (const event of events) {
    const campaign = event.campaign;
    if (!campaign || campaign.status === "idle") continue;
    if (campaign.status === "scheduled" && campaign.scheduledAt) {
      const when = parseDateOnly(campaign.scheduledAt);
      items.push({
        id: `campaign-scheduled-${event.id}`,
        eventId: event.id,
        text: "Campaña programada",
        at: when ? formatDay(when) : "Programada",
        kind: "campaign",
        sortAt: when?.getTime() ?? now.getTime(),
      });
      continue;
    }
    if (campaign.status === "running" || campaign.status === "done") {
      const launched = campaign.launchedAt ? new Date(campaign.launchedAt) : null;
      items.push({
        id: `campaign-launched-${event.id}`,
        eventId: event.id,
        text: "Campaña lanzada",
        at: launched && !Number.isNaN(launched.getTime()) ? formatRelative(launched, now) : "En curso",
        kind: "campaign",
        sortAt: launched && !Number.isNaN(launched.getTime()) ? launched.getTime() : now.getTime(),
      });
    }
  }

  const seenReminder = new Set<string>();
  for (const item of activity) {
    const mapped = mapLoggedActivity(item, now);
    if (!mapped) continue;
    if (mapped.kind === "campaign" && items.some((row) => row.eventId === mapped.eventId && row.kind === "campaign")) {
      continue;
    }
    if (mapped.kind === "reminder") {
      const key = `${mapped.eventId}:${mapped.text}`;
      if (seenReminder.has(key)) continue;
      seenReminder.add(key);
    }
    items.push(mapped);
  }

  return items.sort((a, b) => b.sortAt - a.sortAt);
}

function sentActivityFor(activity: ActivityItem[], eventId: string, rule: FollowUpRule) {
  const label = rule.label.toLowerCase();
  return activity.find((item) => {
    if (item.eventId !== eventId) return false;
    const text = item.text.toLowerCase();
    if (!/recordatorio|seguimiento|recontacto/.test(text)) return false;
    if (isIndecisoRule(rule)) return /seguimiento|recontacto|indeciso/.test(text);
    return text.includes(label);
  });
}

export function buildUpcomingReminders(
  events: EventItem[],
  data: Record<string, EventData>,
  guests: Guest[],
  now = new Date(),
  activity: ActivityItem[] = [],
): UpcomingReminder[] {
  const today = startOfDay(now);
  const rows: UpcomingReminder[] = [];

  for (const event of events) {
    if (event.status === "finalizado") continue;
    const ai = data[event.id]?.ai;
    if (!ai || ai.followUpsEnabled === false) continue;
    const eventGuests = guests.filter((guest) => guest.eventId === event.id);
    if (eventGuests.length === 0) continue;
    const awaitingReply = eventGuests.filter((guest) => !hasReplied(guest)).length;
    const pendingLabel = replyLabel(awaitingReply, eventGuests.length);

    const eventDay = parseDateOnly(event.date);
    const launched = event.campaign?.launchedAt ? parseDateOnly(event.campaign.launchedAt) : null;

    for (const rule of ai.followUps) {
      if (!rule.active || isLaunchRule(rule)) continue;
      const anchor = ruleAnchor(rule);
      const days = Number(rule.days);
      if (!anchor || !Number.isFinite(days)) continue;

      let due: Date | null = null;
      if (anchor === "eventDate" && eventDay) due = addDays(eventDay, -days);
      if (anchor === "contactedAt" && launched) due = addDays(launched, days);
      if (anchor === "seguimiento") {
        const dates = guests
          .filter((guest) => guest.eventId === event.id && guest.status === "seguimiento" && guest.followUp)
          .map((guest) => parseDateOnly(guest.followUp))
          .filter((date): date is Date => Boolean(date && date >= today))
          .sort((a, b) => a.getTime() - b.getTime());
        due = dates[0] ?? null;
      }
      const logged = sentActivityFor(activity, event.id, rule);
      const sent = Boolean(logged) || Boolean(due && due < today);
      let status: UpcomingReminder["status"] = "waiting";
      let dateLabel = "Pendiente de campaña";
      let detail = `Se agenda al lanzar la campaña · ${pendingLabel}`;
      let sortAt = Number.MAX_SAFE_INTEGER;

      if (due && due >= today) {
        status = "upcoming";
        dateLabel = formatDay(due);
        detail = `Se lanza el ${dateLabel} · ${pendingLabel}`;
        sortAt = due.getTime();
        if (logged) {
          detail = `Ya se envió ${logged.at} · el siguiente se lanza el ${dateLabel} · ${pendingLabel}`;
        }
      } else if (sent && due) {
        status = "sent";
        dateLabel = logged ? `Enviado ${logged.at}` : `Enviado el ${formatDay(due)}`;
        detail = `${dateLabel} · ${pendingLabel}`;
        sortAt = due.getTime();
      } else if (logged) {
        status = "sent";
        dateLabel = `Enviado ${logged.at}`;
        detail = `${dateLabel} · ${pendingLabel}`;
        sortAt = today.getTime();
      }

      rows.push({
        id: `${event.id}-${rule.id}`,
        eventId: event.id,
        eventName: event.name,
        label: rule.label,
        when: pendingLabel,
        dateLabel,
        detail,
        status,
        sortAt,
      });
    }
  }

  return rows.sort((a, b) => a.sortAt - b.sortAt || a.eventName.localeCompare(b.eventName, "es"));
}
