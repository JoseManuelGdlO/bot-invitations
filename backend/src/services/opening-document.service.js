import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { httpError } from "../utils/http-error.js";
import { serializeTemplate } from "../utils/serialize.js";
import { findTemplate } from "./templates.service.js";

export const OPENING_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const MISSING_OPENING_DOCUMENT_MESSAGE = "Activa el adjunto pero falta el documento.";

const MIME_BY_EXT = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const EXT_BY_MIME = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

function uploadsRoot() {
  return path.resolve(env.uploadsDir || path.join(process.cwd(), "uploads"));
}

function sanitizeFileName(original, ext) {
  const base = path
    .basename(String(original || "documento"), path.extname(String(original || "")))
    .replace(/[^\w.\- áéíóúüÁÉÍÓÚÜñÑ]+/g, "_")
    .replace(/_+/g, "_")
    .trim()
    .slice(0, 80) || "documento";
  return `${base}${ext}`;
}

export function detectOpeningDocumentType(file = {}) {
  const original = String(file.originalname || file.fileName || "").trim();
  const ext = path.extname(original).toLowerCase();
  const mime = String(file.mimetype || file.mime || "").toLowerCase();
  const resolvedMime = EXT_BY_MIME[mime] ? mime : MIME_BY_EXT[ext] || null;
  const resolvedExt = resolvedMime ? EXT_BY_MIME[resolvedMime] : null;
  if (!resolvedMime || !resolvedExt) return null;
  return {
    mime: resolvedMime,
    ext: resolvedExt,
    fileName: sanitizeFileName(original, resolvedExt),
  };
}

export function relativeDocumentPath(eventId, fileId, ext) {
  return path.posix.join("opening-docs", String(eventId), `${fileId}${ext}`);
}

/** Extrae `opening-docs/...` aunque el valor sea una ruta absoluta de otro host (`/app/uploads/...`). */
export function extractOpeningDocsRelative(stored) {
  const raw = String(stored || "").trim().replace(/\\/g, "/");
  if (!raw) return null;
  const marker = "opening-docs/";
  const idx = raw.indexOf(marker);
  if (idx < 0) return null;
  return raw.slice(idx);
}

export function absoluteDocumentPath(storedRelative) {
  if (!storedRelative) return null;
  const relative = extractOpeningDocsRelative(storedRelative) || storedRelative;
  if (path.isAbsolute(relative)) return null;
  const root = uploadsRoot();
  const resolved = path.resolve(root, relative);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(prefix)) return null;
  return resolved;
}

export function resolveOpeningDocumentFilePath(headerDocument = {}) {
  const stored = String(
    headerDocument.relativePath
    || headerDocument.documentPath
    || headerDocument.filePath
    || headerDocument.absolutePath
    || "",
  ).trim();
  if (!stored) return null;
  const extracted = extractOpeningDocsRelative(stored);
  if (extracted) return absoluteDocumentPath(extracted);
  if (!path.isAbsolute(stored)) return absoluteDocumentPath(stored);
  return stored;
}

export async function resolveStoredDocument(template) {
  const abs = absoluteDocumentPath(template?.documentPath);
  if (!abs) return null;
  try {
    await fs.access(abs);
  } catch {
    return null;
  }
  return {
    absolutePath: abs,
    relativePath: extractOpeningDocsRelative(template.documentPath) || template.documentPath,
    fileName: template.documentFileName || path.basename(abs),
    mime: template.documentMime || "application/pdf",
    size: Number(template.documentSize) || 0,
  };
}

export async function assertOpeningDocumentReady(template) {
  if (!template?.attachDocument) return { attachDocument: false };
  const templateName = String(env.meta?.templateNameDocument || "").trim();
  if (!templateName) throw httpError(400, "Falta META_TEMPLATE_NAME_DOCUMENT.");
  const stored = await resolveStoredDocument(template);
  if (!stored) throw httpError(400, MISSING_OPENING_DOCUMENT_MESSAGE);
  return { attachDocument: true, templateName, ...stored };
}

async function removeFile(storedRelative) {
  const abs = absoluteDocumentPath(storedRelative);
  if (!abs) return;
  await fs.unlink(abs).catch(() => {});
}

export async function saveOpeningDocument(event, file) {
  if (!file?.buffer?.length) throw httpError(400, "Selecciona un PDF o Word de hasta 10 MB.");
  if (file.buffer.length > OPENING_DOCUMENT_MAX_BYTES) {
    throw httpError(400, "El archivo no puede superar 10 MB.");
  }
  const type = detectOpeningDocumentType(file);
  if (!type) throw httpError(400, "El documento debe ser PDF o Word (doc, docx).");

  const tpl = await findTemplate(event.id, { category: "Primer contacto" });
  if (!tpl) throw httpError(400, "No hay plantilla de invitación inicial.");

  const fileId = crypto.randomUUID();
  const relative = relativeDocumentPath(event.id, fileId, type.ext);
  const abs = absoluteDocumentPath(relative);
  if (!abs) throw httpError(500, "No se pudo guardar el documento.");
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, file.buffer);

  const previousPath = tpl.documentPath;
  tpl.documentPath = relative;
  tpl.documentFileName = type.fileName;
  tpl.documentMime = type.mime;
  tpl.documentSize = file.buffer.length;
  await tpl.save();
  if (previousPath && previousPath !== relative) await removeFile(previousPath);
  return serializeTemplate(tpl);
}

export async function getOpeningDocumentFile(event) {
  const tpl = await findTemplate(event.id, { category: "Primer contacto" });
  const stored = await resolveStoredDocument(tpl);
  if (!stored) throw httpError(404, "No hay documento adjunto.");
  return stored;
}
