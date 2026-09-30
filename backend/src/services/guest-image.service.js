import dns from "node:dns/promises";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import JSZip from "jszip";
import { env } from "../config/env.js";
import { httpError } from "../utils/http-error.js";

export const GUEST_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

function uploadsRoot(uploadsDir) {
  return path.resolve(uploadsDir || env.uploadsDir || path.join(process.cwd(), "uploads"));
}

export function detectGuestImage(buffer) {
  if (!buffer || buffer.length < 8 || buffer.length > GUEST_IMAGE_MAX_BYTES) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: ".jpg", mime: "image/jpeg" };
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { ext: ".png", mime: "image/png" };
  }
  return null;
}

export function isPrivateIp(ip) {
  const raw = String(ip || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = raw.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);
  if (net.isIP(raw) === 4) {
    const parts = raw.split(".").map((n) => Number(n));
    if (parts.some((n) => !Number.isInteger(n))) return true;
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (net.isIP(raw) === 6) {
    if (raw === "::1" || raw === "::") return true;
    if (raw.startsWith("fc") || raw.startsWith("fd") || raw.startsWith("fe80")) return true;
    return false;
  }
  return false;
}

function blockedHost(hostname) {
  const host = String(hostname || "").replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "metadata.google.internal" || host === "metadata.internal") return true;
  return false;
}

export async function assertSafeHttpsUrl(raw, lookup = dns.lookup) {
  let url;
  try {
    url = new URL(String(raw || "").trim());
  } catch {
    throw httpError(400, "El enlace de la imagen no es público.");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw httpError(400, "El enlace de la imagen no es público.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (blockedHost(host)) throw httpError(400, "El enlace de la imagen no es público.");
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw httpError(400, "El enlace de la imagen no es público.");
    return url;
  }
  let records;
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw httpError(400, "El enlace de la imagen no es público.");
  }
  const list = Array.isArray(records) ? records : [records];
  if (!list.length) throw httpError(400, "El enlace de la imagen no es público.");
  for (const entry of list) {
    const address = typeof entry === "string" ? entry : entry?.address;
    if (!address || isPrivateIp(address)) {
      throw httpError(400, "El enlace de la imagen no es público.");
    }
  }
  return url;
}

async function readBody(res) {
  const declared = Number(res.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > GUEST_IMAGE_MAX_BYTES) {
    throw httpError(400, "La imagen supera 5 MB.");
  }
  if (typeof res.arrayBuffer === "function") {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > GUEST_IMAGE_MAX_BYTES) throw httpError(400, "La imagen supera 5 MB.");
    return buf;
  }
  throw httpError(400, "No se pudo descargar la imagen del enlace.");
}

export async function downloadGuestImage(raw, deps = {}) {
  const lookup = deps.lookup || dns.lookup;
  const fetchImpl = deps.fetch || globalThis.fetch;
  let current = String(raw || "").trim();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const url = await assertSafeHttpsUrl(current, lookup);
    const timeout = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
    let res;
    try {
      res = await fetchImpl(url, { redirect: "manual", signal: timeout });
    } catch {
      throw httpError(400, "No se pudo descargar la imagen del enlace.");
    }
    const status = Number(res?.status);
    if (status >= 300 && status < 400) {
      const location = res.headers?.get?.("location");
      if (!location || hop === MAX_REDIRECTS) {
        throw httpError(400, "El enlace de la imagen no es público.");
      }
      current = new URL(location, url).href;
      continue;
    }
    if (status !== 200) throw httpError(400, "No se pudo descargar la imagen del enlace.");
    const buffer = await readBody(res);
    const detected = detectGuestImage(buffer);
    if (!detected) throw httpError(400, "La imagen de la celda no es JPEG o PNG, o supera 5 MB.");
    return { buffer, ...detected };
  }
  throw httpError(400, "El enlace de la imagen no es público.");
}

export async function resolveGuestImageBytes({ embedded = null, cellText = "", download = downloadGuestImage } = {}) {
  if (embedded?.buffer) {
    const detected = detectGuestImage(embedded.buffer);
    if (!detected) {
      return { warning: "La imagen de la celda no es JPEG o PNG, o supera 5 MB." };
    }
    return { buffer: embedded.buffer, ext: detected.ext, mime: detected.mime };
  }
  const text = String(cellText || "").trim();
  if (!text || text === "(imagen)") return {};
  if (/^https:\/\//i.test(text)) {
    try {
      return await download(text);
    } catch {
      return { warning: "No se pudo descargar la imagen del enlace." };
    }
  }
  if (/^http:\/\//i.test(text)) {
    return { warning: "El enlace de la imagen debe usar https." };
  }
  return {};
}

function parseRels(xml) {
  const list = [];
  if (!xml) return list;
  const re = /<Relationship\b([^>]*)\/?>/g;
  let match;
  while ((match = re.exec(xml))) {
    const attrs = match[1];
    const id = attrs.match(/\bId="([^"]+)"/)?.[1];
    const target = attrs.match(/\bTarget="([^"]+)"/)?.[1];
    const type = attrs.match(/\bType="([^"]+)"/)?.[1] || "";
    if (id && target) list.push({ id, target, type });
  }
  return list;
}

function resolveZipPath(sourcePart, target) {
  const clean = String(target || "").replace(/\\/g, "/");
  if (clean.startsWith("/")) return clean.replace(/^\/+/, "");
  const baseDir = String(sourcePart || "").split("/").slice(0, -1);
  const stack = [...baseDir];
  for (const part of clean.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

function relsPathFor(partPath) {
  const slash = partPath.lastIndexOf("/");
  const dir = partPath.slice(0, slash);
  const name = partPath.slice(slash + 1);
  return `${dir}/_rels/${name}.rels`;
}

function colToIndex(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

async function readText(zip, filePath) {
  const file = zip.file(filePath);
  if (!file) return "";
  return file.async("string");
}

function firstSheetPath(workbookXml, workbookRelsXml) {
  const rid = workbookXml.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  const rels = parseRels(workbookRelsXml);
  const target = rels.find((rel) => rel.id === rid)?.target;
  if (!target) return "xl/worksheets/sheet1.xml";
  return resolveZipPath("xl/workbook.xml", target);
}

function parseCells(sheetXml) {
  const cells = [];
  const paired = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
  const self = /<c\b([^>]*?)\/>/g;
  let match;
  while ((match = paired.exec(sheetXml))) {
    const ref = match[1].match(/\br="([A-Z]+)(\d+)"/);
    if (!ref) continue;
    const formula = match[2].match(/DISPIMG\(\s*(?:&quot;|")([^"&]+)/i);
    const vm = match[1].match(/\bvm="(\d+)"/);
    cells.push({
      row: Number(ref[2]),
      col: colToIndex(ref[1]),
      dispId: formula?.[1] || "",
      vm: vm ? Number(vm[1]) : 0,
    });
  }
  while ((match = self.exec(sheetXml))) {
    const vm = match[1].match(/\bvm="(\d+)"/);
    const ref = match[1].match(/\br="([A-Z]+)(\d+)"/);
    if (!ref) continue;
    cells.push({
      row: Number(ref[2]),
      col: colToIndex(ref[1]),
      dispId: "",
      vm: vm ? Number(vm[1]) : 0,
    });
  }
  return cells;
}

function parseCellImageMap(xml, relsXml) {
  const rels = parseRels(relsXml);
  const map = new Map();
  const blocks = String(xml || "").split(/cellImage\b/).slice(1);
  for (const block of blocks) {
    const name = block.match(/\bname="([^"]+)"/)?.[1];
    const embed = block.match(/\br:embed="([^"]+)"/)?.[1];
    const target = rels.find((rel) => rel.id === embed)?.target;
    if (name && target) map.set(name, resolveZipPath("xl/cellimages.xml", target));
  }
  return map;
}

function parseRichRelPaths(xml, relsXml) {
  const rels = parseRels(relsXml);
  const ids = [];
  const re = /\br:id="([^"]+)"/g;
  let match;
  while ((match = re.exec(xml || ""))) ids.push(match[1]);
  return ids.map((id) => {
    const target = rels.find((rel) => rel.id === id)?.target;
    return target ? resolveZipPath("xl/richData/richValueRel.xml", target) : "";
  });
}

function parseDrawingAnchors(drawingXml, relsXml, drawingPath) {
  const rels = parseRels(relsXml);
  const blocks = String(drawingXml || "").split(/<xdr:(?:twoCellAnchor|oneCellAnchor)\b/).slice(1);
  const anchors = [];
  for (const block of blocks) {
    const from = block.match(/<xdr:from>([\s\S]*?)<\/xdr:from>/);
    if (!from) continue;
    const col = Number(from[1].match(/<xdr:col>(\d+)<\/xdr:col>/)?.[1]);
    const row = Number(from[1].match(/<xdr:row>(\d+)<\/xdr:row>/)?.[1]);
    const embed = block.match(/\br:embed="([^"]+)"/)?.[1];
    const target = rels.find((rel) => rel.id === embed)?.target;
    if (!Number.isInteger(col) || !Number.isInteger(row) || !target) continue;
    anchors.push({
      row: row + 1,
      col: col + 1,
      mediaPath: resolveZipPath(drawingPath, target),
    });
  }
  return anchors;
}

async function loadImage(zip, mediaPath) {
  if (!mediaPath) return null;
  const file = zip.file(mediaPath);
  if (!file) return null;
  const buffer = await file.async("nodebuffer");
  const detected = detectGuestImage(buffer);
  if (!detected) return null;
  return { buffer, ...detected };
}

export async function extractSheetImages(buffer) {
  const images = new Map();
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return images;
  }
  const workbookXml = await readText(zip, "xl/workbook.xml");
  const sheetPath = firstSheetPath(workbookXml, await readText(zip, "xl/_rels/workbook.xml.rels"));
  const sheetXml = await readText(zip, sheetPath);
  const cells = parseCells(sheetXml);
  const dispMap = parseCellImageMap(
    await readText(zip, "xl/cellimages.xml"),
    await readText(zip, "xl/_rels/cellimages.xml.rels"),
  );
  const richRels = parseRichRelPaths(
    await readText(zip, "xl/richData/richValueRel.xml"),
    await readText(zip, "xl/richData/_rels/richValueRel.xml.rels"),
  );

  for (const cell of cells) {
    const key = `${cell.row}:${cell.col}`;
    if (images.has(key)) continue;
    const mediaPath = cell.dispId
      ? dispMap.get(cell.dispId)
      : (cell.vm ? richRels[cell.vm - 1] : "");
    const image = await loadImage(zip, mediaPath);
    if (image) images.set(key, image);
  }

  const sheetRels = parseRels(await readText(zip, relsPathFor(sheetPath)));
  const drawingRel = sheetRels.find((rel) => String(rel.type).endsWith("/drawing"));
  if (drawingRel) {
    const drawingPath = resolveZipPath(sheetPath, drawingRel.target);
    const anchors = parseDrawingAnchors(
      await readText(zip, drawingPath),
      await readText(zip, relsPathFor(drawingPath)),
      drawingPath,
    );
    for (const anchor of anchors) {
      const key = `${anchor.row}:${anchor.col}`;
      if (images.has(key)) continue;
      const image = await loadImage(zip, anchor.mediaPath);
      if (image) images.set(key, image);
    }
  }
  return images;
}

export function guestImageStatuses({
  columns,
  rows,
  sheetRows = [],
  hyperlinks = [],
  mapping,
  images,
}) {
  const colIndex = columns.findIndex((col) => mapping?.[col] === "image");
  return rows.map((row, i) => {
    if (colIndex < 0) return "empty";
    const sheetRow = sheetRows[i] || i + 2;
    if (images?.has(`${sheetRow}:${colIndex + 1}`)) return "image";
    const link = String(hyperlinks[i]?.[colIndex] || "").trim();
    const text = String(row[colIndex] || "").trim();
    const candidate = /^https?:\/\//i.test(link) ? link : text;
    if (/^https:\/\//i.test(candidate)) return "link";
    return "empty";
  });
}

export function markEmbeddedImageCells({ rows, sheetRows = [], images }) {
  return rows.map((row, i) => {
    const sheetRow = sheetRows[i] || i + 2;
    return row.map((cell, col) => (images?.has(`${sheetRow}:${col + 1}`) ? "(imagen)" : cell));
  });
}

export function embeddedImageCells(images) {
  return [...(images?.keys?.() || [])];
}

function safeId(value, label) {
  const id = String(value || "").trim();
  if (!ID_RE.test(id)) throw httpError(400, `${label} inválido.`);
  return id;
}

export function guestImageAbsolutePath(relativePath, uploadsDir) {
  const rel = String(relativePath || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel.startsWith("guest-images/") || rel.includes("..")) return null;
  const root = uploadsRoot(uploadsDir);
  const resolved = path.resolve(root, rel);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(prefix)) return null;
  return resolved;
}

export async function saveGuestImage({ eventId, guestId, buffer, uploadsDir } = {}) {
  const detected = detectGuestImage(buffer);
  if (!detected) throw httpError(400, "La imagen de la celda no es JPEG o PNG, o supera 5 MB.");
  const event = safeId(eventId, "Evento");
  const guest = safeId(guestId, "Invitado");
  const relative = path.posix.join("guest-images", event, `${guest}${detected.ext}`);
  const absolute = guestImageAbsolutePath(relative, uploadsDir);
  await fsPromises.mkdir(path.dirname(absolute), { recursive: true });
  await fsPromises.writeFile(absolute, buffer);
  return relative;
}

export async function deleteGuestImage(relativePath, uploadsDir) {
  const absolute = guestImageAbsolutePath(relativePath, uploadsDir);
  if (!absolute) return;
  await fsPromises.unlink(absolute).catch(() => {});
}

export function headerImageForGuest(ctx, guest, { exists = fs.existsSync, uploadsDir } = {}) {
  const templateImage = ctx?.hsmHeaderImage || null;
  const headerType = ctx?.template?.headerType;
  const allowsGuestImage = headerType === "image" || (headerType == null && Boolean(templateImage));
  if (!allowsGuestImage) return templateImage;
  const rel = String(guest?.invitationImagePath || "").trim().replace(/\\/g, "/");
  const absolute = guestImageAbsolutePath(rel, uploadsDir);
  if (absolute && exists(absolute)) {
    return {
      relativePath: rel,
      fileName: path.posix.basename(rel),
      mime: rel.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
      ...(guest?.eventId ? { eventId: guest.eventId } : {}),
    };
  }
  return templateImage;
}
