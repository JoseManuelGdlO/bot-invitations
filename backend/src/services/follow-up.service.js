function fold(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function parseDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const dmy = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  return null;
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date, days) {
  const d = startOfDay(date);
  d.setDate(d.getDate() + Number(days) || 0);
  return d;
}

export function formatFollowUpDate(date) {
  const d = date instanceof Date ? startOfDay(date) : parseDateOnly(date);
  if (!d) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function parseFollowUpDateInput(raw) {
  return parseDateOnly(raw);
}

export function isLaunchFollowUpRule(rule) {
  return /primer contacto/i.test(String(rule?.label || ""));
}

export const INDECISO_NUDGE_ID = "indeciso";
export const INDECISO_NUDGE_DAYS = 3;

export function defaultIndecisoFollowUpDate(now = new Date()) {
  return addDays(startOfDay(now), INDECISO_NUDGE_DAYS);
}

export function parseFollowUpWhen(when) {
  const text = fold(when);
  const match = text.match(/(\d+)\s*dias?/);
  if (!match) return null;
  const days = Number(match[1]);
  if (!Number.isFinite(days)) return null;
  if (text.includes("despues del primer contacto") || text.includes("despues de primer contacto")) {
    return { days, from: "contactedAt" };
  }
  if (text.includes("antes del evento")) {
    return { days, from: "eventDate" };
  }
  return null;
}

export function computeFollowUpDueAt(rule, { contactedAt, eventDate } = {}) {
  const spec = parseFollowUpWhen(rule?.when);
  if (!spec) return null;
  if (spec.from === "contactedAt") {
    const base = parseDateOnly(contactedAt) || (contactedAt instanceof Date ? startOfDay(contactedAt) : null);
    if (!base) return null;
    return addDays(base, spec.days);
  }
  const eventDay = parseDateOnly(eventDate);
  if (!eventDay) return null;
  return addDays(eventDay, -spec.days);
}

export function isDue(due, now = new Date()) {
  if (!due) return false;
  return startOfDay(due).getTime() <= startOfDay(now).getTime();
}

export function nextActiveFollowUpDate(
  followUps,
  { contactedAt, eventDate, now = new Date(), alreadySent = [] } = {},
) {
  const sent = new Set(alreadySent);
  const rules = (Array.isArray(followUps) ? followUps : []).filter(
    (rule) => rule?.active && !isLaunchFollowUpRule(rule) && !sent.has(rule.id),
  );
  let soonestFuture = null;
  let soonestAny = null;
  const today = startOfDay(now);
  for (const rule of rules) {
    const due = computeFollowUpDueAt(rule, { contactedAt: contactedAt || now, eventDate });
    if (!due) continue;
    if (!soonestAny || due < soonestAny) soonestAny = due;
    if (due >= today && (!soonestFuture || due < soonestFuture)) soonestFuture = due;
  }
  return soonestFuture || soonestAny;
}
