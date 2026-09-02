import { resolveEventTimezone } from "./timezone.js";

export function formatClock(date = new Date(), timeZone) {
  return new Date(date).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: resolveEventTimezone(timeZone),
  });
}

export function formatRelative(date) {
  if (!date) return "";
  const diff = Date.now() - new Date(date).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return new Date(date).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

export function formatDuration(ms) {
  if (!ms || ms < 0) return "—";
  const totalMin = Math.round(ms / 60000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours === 0) return `${minutes} m`;
  return `${hours} h ${String(minutes).padStart(2, "0")} m`;
}

export function weekdayLabel(date) {
  const labels = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return labels[new Date(date).getDay()] ?? "Lun";
}
