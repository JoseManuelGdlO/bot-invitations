import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { httpError } from "../utils/http-error.js";

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const IMPORT_STAGING_MAX_AGE_MS = 2 * 60 * 60 * 1000;

function stagingDir(root) {
  return root || path.join(env.uploadsDir || path.join(process.cwd(), "uploads"), "import-staging");
}

async function sweep(dir, maxAgeMs) {
  const names = await fs.readdir(dir).catch(() => []);
  const now = Date.now();
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const metaPath = path.join(dir, name);
    const raw = await fs.readFile(metaPath, "utf8").catch(() => "");
    let createdAt = 0;
    try {
      createdAt = Number(JSON.parse(raw).createdAt) || 0;
    } catch {
      createdAt = 0;
    }
    if (!createdAt || now - createdAt <= maxAgeMs) continue;
    const token = name.replace(/\.json$/, "");
    await fs.unlink(path.join(dir, `${token}.bin`)).catch(() => {});
    await fs.unlink(metaPath).catch(() => {});
  }
}

export async function stageSpreadsheet({
  userId,
  eventId,
  buffer,
  filename = "",
  root,
  maxAgeMs = IMPORT_STAGING_MAX_AGE_MS,
} = {}) {
  const dir = stagingDir(root);
  await fs.mkdir(dir, { recursive: true });
  await sweep(dir, maxAgeMs);
  const token = crypto.randomUUID();
  await fs.writeFile(path.join(dir, `${token}.bin`), buffer);
  await fs.writeFile(path.join(dir, `${token}.json`), JSON.stringify({
    userId,
    eventId,
    filename: String(filename || ""),
    createdAt: Date.now(),
  }));
  return token;
}

export async function readStagedSpreadsheet({
  token,
  userId,
  eventId,
  root,
  maxAgeMs = IMPORT_STAGING_MAX_AGE_MS,
} = {}) {
  if (!TOKEN_RE.test(String(token || ""))) {
    throw httpError(400, "La importación expiró. Vuelve a subir el archivo.");
  }
  const dir = stagingDir(root);
  const metaPath = path.join(dir, `${token}.json`);
  const raw = await fs.readFile(metaPath, "utf8").catch(() => "");
  if (!raw) throw httpError(400, "La importación expiró. Vuelve a subir el archivo.");
  let meta;
  try {
    meta = JSON.parse(raw);
  } catch {
    throw httpError(400, "La importación expiró. Vuelve a subir el archivo.");
  }
  if (meta.userId !== userId || meta.eventId !== eventId) {
    throw httpError(400, "La importación expiró. Vuelve a subir el archivo.");
  }
  if (Date.now() - Number(meta.createdAt || 0) > maxAgeMs) {
    await discardStagedSpreadsheet(token, root);
    throw httpError(400, "La importación expiró. Vuelve a subir el archivo.");
  }
  const buffer = await fs.readFile(path.join(dir, `${token}.bin`)).catch(() => null);
  if (!buffer) throw httpError(400, "La importación expiró. Vuelve a subir el archivo.");
  return { buffer, filename: meta.filename || "" };
}

export async function discardStagedSpreadsheet(token, root) {
  if (!TOKEN_RE.test(String(token || ""))) return;
  const dir = stagingDir(root);
  await fs.unlink(path.join(dir, `${token}.bin`)).catch(() => {});
  await fs.unlink(path.join(dir, `${token}.json`)).catch(() => {});
}
