import crypto from "node:crypto";
import fsSync from "node:fs";
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

function bundledRoot() {
  const raw = String(env.bundledOpeningDocsDir || "").trim();
  if (!raw) return null;
  return path.resolve(raw);
}

function eventIdFromOpeningPath(stored) {
  const rel = extractOpeningDocsRelative(stored) || String(stored || "").replace(/\\/g, "/");
  const parts = rel.split("/").filter(Boolean);
  if (parts[0] === "opening-docs" && parts[1]) return parts[1];
  return null;
}

function eventOpeningDirs(eventId) {
  const id = String(eventId || "").trim();
  if (!id) return [];
  const dirs = [path.join(uploadsRoot(), "opening-docs", id)];
  const bundled = bundledRoot();
  if (bundled) dirs.push(path.join(bundled, id));
  return dirs;
}

function existsSync(abs) {
  if (!abs) return false;
  try {
    fsSync.accessSync(abs);
    return true;
  } catch {
    return false;
  }
}

function firstDocumentInEventDir(eventId) {
  const id = String(eventId || "").trim();
  if (!id) return null;
  for (const dir of eventOpeningDirs(id)) {
    let names;
    try {
      names = fsSync.readdirSync(dir);
    } catch {
      continue;
    }
    const name = names.find((entry) => MIME_BY_EXT[path.extname(entry).toLowerCase()]);
    if (!name) continue;
    return {
      absolutePath: path.join(dir, name),
      relativePath: path.posix.join("opening-docs", id, name),
      fileName: name,
    };
  }
  return null;
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
  const eventId = headerDocument.eventId || eventIdFromOpeningPath(stored);

  if (stored) {
    const extracted = extractOpeningDocsRelative(stored);
    if (extracted) {
      const mapped = absoluteDocumentPath(extracted);
      if (mapped && existsSync(mapped)) return mapped;
      const eid = eventIdFromOpeningPath(extracted) || eventId;
      const bundled = bundledRoot();
      if (bundled && eid) {
        const inBundled = path.join(bundled, eid, path.posix.basename(extracted));
        if (existsSync(inBundled)) return inBundled;
      }
      const fallback = firstDocumentInEventDir(eid);
      if (fallback) return fallback.absolutePath;
      return mapped;
    }
    if (!path.isAbsolute(stored)) {
      const mapped = absoluteDocumentPath(stored);
      if (mapped && existsSync(mapped)) return mapped;
      const fallback = firstDocumentInEventDir(eventId);
      if (fallback) return fallback.absolutePath;
      return mapped;
    }
    if (existsSync(stored)) return stored;
    const fallback = firstDocumentInEventDir(eventId);
    if (fallback) return fallback.absolutePath;
    return stored;
  }

  return firstDocumentInEventDir(eventId)?.absolutePath || null;
}

function storedFromAbs(abs, template, relativePath) {
  const ext = path.extname(abs).toLowerCase();
  return {
    absolutePath: abs,
    relativePath: relativePath || extractOpeningDocsRelative(template?.documentPath) || template?.documentPath,
    fileName: template?.documentFileName || path.basename(abs),
    mime: template?.documentMime || MIME_BY_EXT[ext] || "application/pdf",
    size: Number(template?.documentSize) || 0,
  };
}

export async function resolveStoredDocument(template) {
  const eventId = template?.eventId || eventIdFromOpeningPath(template?.documentPath);
  const abs = absoluteDocumentPath(template?.documentPath);
  if (abs && existsSync(abs)) {
    return storedFromAbs(
      abs,
      template,
      extractOpeningDocsRelative(template.documentPath) || template.documentPath,
    );
  }

  const extracted = extractOpeningDocsRelative(template?.documentPath);
  const bundled = bundledRoot();
  if (bundled && extracted) {
    const eid = eventIdFromOpeningPath(extracted) || eventId;
    if (eid) {
      const inBundled = path.join(bundled, eid, path.posix.basename(extracted));
      if (existsSync(inBundled)) return storedFromAbs(inBundled, template, extracted);
    }
  }

  const fallback = firstDocumentInEventDir(eventId);
  if (!fallback) return null;
  if (template && template.documentPath !== fallback.relativePath && typeof template.save === "function") {
    template.documentPath = fallback.relativePath;
    await template.save().catch(() => {});
  }
  return storedFromAbs(fallback.absolutePath, template, fallback.relativePath);
}

export async function assertOpeningDocumentReady(template) {
  if (!template?.attachDocument) return { attachDocument: false };
  const templateName = String(env.meta?.templateNameDocument || "").trim();
  if (!templateName) throw httpError(400, "Falta META_TEMPLATE_NAME_DOCUMENT.");
  const stored = await resolveStoredDocument(template);
  if (!stored) throw httpError(400, MISSING_OPENING_DOCUMENT_MESSAGE);
  const eventId = template?.eventId || eventIdFromOpeningPath(stored.relativePath);
  return { attachDocument: true, templateName, eventId, ...stored };
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
  tpl.attachDocument = true;
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
