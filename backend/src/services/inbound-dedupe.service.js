import crypto from "node:crypto";
import { InboundEventDedup } from "../models/index.js";

function isUniqueViolation(err) {
  if (!err) return false;
  if (err.name === "SequelizeUniqueConstraintError") return true;
  const code = err.parent?.code || err.original?.code || err.code;
  return code === "ER_DUP_ENTRY" || code === "23505";
}

export function inboundDedupeKey({ payload = {}, rawBody = "", messageId = "" } = {}) {
  const id = String(messageId || "").trim();
  if (id) return `msg:${id}`.slice(0, 191);
  const raw = String(rawBody || "").trim() || JSON.stringify(payload || {});
  return `body:${crypto.createHash("sha256").update(raw).digest("hex")}`;
}

export async function claimInboundEvent({ ownerUserId, dedupeKey }) {
  const owner = String(ownerUserId || "").trim();
  const key = String(dedupeKey || "").trim();
  if (!owner || !key) return { duplicate: false };
  try {
    await InboundEventDedup.create({ ownerUserId: owner, dedupeKey: key });
    return { duplicate: false };
  } catch (err) {
    if (isUniqueViolation(err)) return { duplicate: true };
    throw err;
  }
}
