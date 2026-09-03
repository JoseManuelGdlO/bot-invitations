import type { ConfirmationStatus, GuestType } from "./types";

export const STATUS_META: Record<
  ConfirmationStatus,
  { label: string; className: string }
> = {
  sin_contactar: {
    label: "Sin contactar",
    className: "bg-muted text-muted-foreground border-border",
  },
  enviado: {
    label: "Mensaje enviado",
    className: "bg-info-soft text-info border-transparent",
  },
  entregado: {
    label: "Entregado",
    className: "bg-info-soft text-info border-transparent",
  },
  en_conversacion: {
    label: "En conversación",
    className: "bg-gold-soft text-gold-foreground border-transparent",
  },
  confirmado: {
    label: "Confirmado",
    className: "bg-success-soft text-success border-transparent",
  },
  parcial: {
    label: "Confirmación parcial",
    className: "bg-warning-soft text-warning border-transparent",
  },
  no_asistira: {
    label: "No asistirá",
    className: "bg-rose text-rose-foreground border-transparent",
  },
  seguimiento: {
    label: "Requiere seguimiento",
    className: "bg-warning-soft text-warning border-transparent",
  },
};

export const GUEST_TYPE: Record<
  GuestType,
  { label: string; className: string }
> = {
  VIP: {
    label: "VIP",
    className: "bg-gold-soft text-gold-foreground border-transparent",
  },
};

export const STATUS_FILTER_OPTIONS = (
  Object.keys(STATUS_META) as ConfirmationStatus[]
).map((value) => ({ value, label: STATUS_META[value].label }));

export const WHATSAPP_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  enviado: "Enviado",
  entregado: "Entregado",
  leido: "Leído",
  respondido: "Respondido",
};

export function formatDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatShortDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function daysUntil(iso: string) {
  const d = new Date(`${iso}T12:00:00`).getTime();
  return Math.max(0, Math.round((d - Date.now()) / 86400000));
}

export function toInputDate(value: Date | string = new Date()) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
