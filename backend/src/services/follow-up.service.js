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

export const FOLLOW_UP_DAYS_MIN = 1;
export const FOLLOW_UP_DAYS_MAX = 180;
export const INDECISO_NUDGE_ID = "indeciso";
export const INDECISO_NUDGE_DAYS = 3;

export function clampFollowUpDays(raw, fallback = FOLLOW_UP_DAYS_MIN) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(FOLLOW_UP_DAYS_MAX, Math.max(FOLLOW_UP_DAYS_MIN, n));
}

export function isLaunchFollowUpRule(rule) {
  if (String(rule?.id || "") === "f1") return true;
  return /primer contacto/i.test(String(rule?.label || ""));
}

export function isIndecisoFollowUpRule(rule) {
  if (String(rule?.id || "") === INDECISO_NUDGE_ID) return true;
  return /indeciso|recontacto/i.test(String(rule?.label || ""));
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
  if (text.includes("despues de marcar seguimiento") || text.includes("despues del seguimiento")) {
    return { days, from: "seguimiento" };
  }
  if (text.includes("antes del evento")) {
    return { days, from: "eventDate" };
  }
  return null;
}

export function inferFollowUpFrom(rule) {
  const parsed = parseFollowUpWhen(rule?.when);
  if (parsed?.from) return parsed.from;
  if (isIndecisoFollowUpRule(rule)) return "seguimiento";
  if (isLaunchFollowUpRule(rule)) return "eventDate";
  const id = String(rule?.id || "");
  if (id === "f2" || id === "f3") return "contactedAt";
  if (id === "f4") return "eventDate";
  return null;
}

export function formatFollowUpWhen(days, from) {
  const n = clampFollowUpDays(days);
  const unit = n === 1 ? "día" : "días";
  if (from === "contactedAt") return `${n} ${unit} después del primer contacto`;
  if (from === "seguimiento") return `${n} ${unit} después de marcar seguimiento`;
  return `${n} ${unit} antes del evento`;
}

export function followUpDays(rule, fallback = null) {
  const n = Number(rule?.days);
  if (Number.isFinite(n)) return clampFollowUpDays(n);
  const parsed = parseFollowUpWhen(rule?.when);
  if (parsed && Number.isFinite(parsed.days)) return clampFollowUpDays(parsed.days);
  return fallback;
}

export function indecisoFollowUpDays(followUps) {
  const rule = (Array.isArray(followUps) ? followUps : []).find(isIndecisoFollowUpRule);
  if (!rule) return INDECISO_NUDGE_DAYS;
  return followUpDays(rule, INDECISO_NUDGE_DAYS);
}

export function findIndecisoFollowUpRule(followUps) {
  return (Array.isArray(followUps) ? followUps : []).find(isIndecisoFollowUpRule) || null;
}

export const FOLLOW_UP_DESCRIPTIONS = {
  f1: "Es la invitación inicial. No se envía sola: la lanzas desde Resumen.",
  f2: "Este solo se manda si el invitado ya recibió el primer contacto y todavía no confirma ni declina.",
  f3: "Se manda si, después del primer recordatorio, el invitado sigue sin confirmar ni declinar.",
  f4: "Último recordatorio automático antes del evento, solo a quien aún no tiene RSVP.",
  [INDECISO_NUDGE_ID]:
    "Cuando el invitado pospone la confirmación (luego te digo), el bot agenda este recontacto. Usa la plantilla Seguimiento.",
};

export const DEFAULT_INDECISO_FOLLOW_UP = {
  id: INDECISO_NUDGE_ID,
  label: "Recontacto a indecisos",
  description: FOLLOW_UP_DESCRIPTIONS[INDECISO_NUDGE_ID],
  days: INDECISO_NUDGE_DAYS,
  when: formatFollowUpWhen(INDECISO_NUDGE_DAYS, "seguimiento"),
  active: true,
};

export const DEFAULT_FOLLOW_UPS = [
  {
    id: "f1",
    label: "Primer contacto",
    description: FOLLOW_UP_DESCRIPTIONS.f1,
    days: 30,
    when: formatFollowUpWhen(30, "eventDate"),
    active: true,
  },
  {
    id: "f2",
    label: "Primer recordatorio",
    description: FOLLOW_UP_DESCRIPTIONS.f2,
    days: 7,
    when: formatFollowUpWhen(7, "contactedAt"),
    active: true,
  },
  {
    id: "f3",
    label: "Segundo recordatorio",
    description: FOLLOW_UP_DESCRIPTIONS.f3,
    days: 14,
    when: formatFollowUpWhen(14, "contactedAt"),
    active: true,
  },
  {
    id: "f4",
    label: "Último intento",
    description: FOLLOW_UP_DESCRIPTIONS.f4,
    days: 7,
    when: formatFollowUpWhen(7, "eventDate"),
    active: false,
  },
  { ...DEFAULT_INDECISO_FOLLOW_UP },
];

export function mergeFollowUps(existing) {
  const list = Array.isArray(existing) ? existing.map((rule) => ({ ...rule })) : [];
  if (!list.some(isIndecisoFollowUpRule)) {
    list.push({ ...DEFAULT_INDECISO_FOLLOW_UP });
  }
  return list;
}

export function followUpDescription(item) {
  const custom = String(item?.description || "").trim();
  if (custom) return custom;
  const id = String(item?.id || "");
  if (FOLLOW_UP_DESCRIPTIONS[id]) return FOLLOW_UP_DESCRIPTIONS[id];
  if (isIndecisoFollowUpRule(item)) return FOLLOW_UP_DESCRIPTIONS[INDECISO_NUDGE_ID];
  if (isLaunchFollowUpRule(item)) return FOLLOW_UP_DESCRIPTIONS.f1;
  return "";
}

export function normalizeFollowUp(item) {
  const from = inferFollowUpFrom(item) || "eventDate";
  const days = followUpDays(item, FOLLOW_UP_DAYS_MIN);
  return {
    id: String(item?.id || ""),
    label: String(item?.label || ""),
    description: followUpDescription(item),
    days,
    when: formatFollowUpWhen(days, from),
    active: Boolean(item?.active),
  };
}

export function normalizeFollowUps(raw) {
  if (!Array.isArray(raw)) return null;
  return raw.map(normalizeFollowUp);
}

export function defaultIndecisoFollowUpDate(now = new Date(), days = INDECISO_NUDGE_DAYS) {
  return addDays(startOfDay(now), clampFollowUpDays(days, INDECISO_NUDGE_DAYS));
}

export function computeFollowUpDueAt(rule, { contactedAt, eventDate } = {}) {
  const spec = parseFollowUpWhen(rule?.when);
  const days = Number.isFinite(Number(rule?.days)) ? clampFollowUpDays(Number(rule.days)) : spec?.days;
  const from = spec?.from || inferFollowUpFrom(rule);
  if (!Number.isFinite(days) || !from || from === "seguimiento") return null;
  if (from === "contactedAt") {
    const base = parseDateOnly(contactedAt) || (contactedAt instanceof Date ? startOfDay(contactedAt) : null);
    if (!base) return null;
    return addDays(base, days);
  }
  const eventDay = parseDateOnly(eventDate);
  if (!eventDay) return null;
  return addDays(eventDay, -days);
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
    (rule) =>
      rule?.active &&
      !isLaunchFollowUpRule(rule) &&
      !isIndecisoFollowUpRule(rule) &&
      !sent.has(rule.id),
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
