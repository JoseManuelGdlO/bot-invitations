import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { applyTemplate, eventGuestVars } from "../utils/defaults.js";
import { httpError } from "../utils/http-error.js";
import { guestImageAbsolutePath, headerImageForGuest } from "./guest-image.service.js";

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const QR_CONTENT_MAX = 1000;
const QR_PAYLOAD_MAX = 1800;

export class GuestQrError extends Error {
  constructor(message) {
    super(message);
    this.name = "GuestQrError";
  }
}

export function rewriteDeskoplusPaseUrl(raw) {
  const original = String(raw || "").trim();
  let url;
  try {
    url = new URL(original);
  } catch {
    return original;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  if (url.protocol !== "https:" || host !== "deskoplus.com" || pathname !== "/acceso") {
    return url.toString();
  }
  if (url.searchParams.get("rol") !== "pase") return url.toString();
  const token = String(url.searchParams.get("t") || "").trim();
  if (!token) return url.toString();
  url.searchParams.delete("t");
  url.searchParams.set("rol", "recepcion");
  url.searchParams.set("qr", token);
  return url.toString();
}

export function rewriteDeskoplusPaseUrls(text) {
  return String(text || "").replace(/https:\/\/deskoplus\.com\/acceso\/?\?[^\s)]+/gi, (match) => (
    rewriteDeskoplusPaseUrl(match)
  ));
}

export function resolveGuestQrPayload(template, vars = {}) {
  const raw = String(template || "").trim();
  if (!raw) throw new GuestQrError("Escribe qué va dentro del QR.");
  const filled = applyTemplate(raw, vars).trim();
  if (/\{\{[^{}]+\}\}/.test(filled)) {
    throw new GuestQrError("Falta un dato del invitado para armar el QR.");
  }
  const payload = rewriteDeskoplusPaseUrls(filled).trim();
  if (!payload) throw new GuestQrError("El QR quedó vacío.");
  if (payload.length > QR_PAYLOAD_MAX) {
    throw new GuestQrError("El contenido del QR es demasiado largo.");
  }
  return payload;
}

export function normalizeImageAttachment({ headerType, imageAttachment, qrContent } = {}) {
  if (String(headerType || "").toLowerCase() !== "image") {
    return { imageAttachment: "file", qrContent: null };
  }
  const mode = imageAttachment === "qr" ? "qr" : "file";
  const content = String(qrContent || "").trim();
  if (mode === "qr" && !content) {
    throw httpError(400, "Escribe qué va dentro del QR.");
  }
  if (content.length > QR_CONTENT_MAX) {
    throw httpError(400, "El contenido del QR es demasiado largo.");
  }
  return {
    imageAttachment: mode,
    qrContent: mode === "qr" ? content : null,
  };
}

export async function renderQrPng(text) {
  return QRCode.toBuffer(text, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
  });
}

export async function saveGuestQrHeader({ event, guest, template, uploadsDir } = {}) {
  const payload = resolveGuestQrPayload(template, eventGuestVars(event, guest));
  const buffer = await renderQrPng(payload);
  const eventId = String(guest?.eventId || event?.id || "").trim();
  const guestId = String(guest?.id || "").trim();
  if (!ID_RE.test(eventId) || !ID_RE.test(guestId)) {
    throw new GuestQrError("No se pudo guardar el QR del invitado.");
  }
  const relative = `guest-images/${eventId}/${guestId}-qr.png`;
  const absolute = guestImageAbsolutePath(relative, uploadsDir);
  if (!absolute) throw new GuestQrError("No se pudo guardar el QR del invitado.");
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, buffer);
  return {
    relativePath: relative,
    fileName: `${guestId}-qr.png`,
    mime: "image/png",
    eventId,
    source: "qr",
  };
}

export async function headerImageForSend(ctx, guest, deps = {}) {
  if (ctx?.imageAttachment === "qr") {
    return saveGuestQrHeader({
      event: ctx.event,
      guest,
      template: ctx.qrContent,
      uploadsDir: deps.uploadsDir,
    });
  }
  return headerImageForGuest(ctx, guest, deps);
}
