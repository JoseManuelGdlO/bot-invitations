const BULK_KINDS = new Set(["campaign", "follow_up", "reminder"]);
const HOUR_MS = 60 * 60 * 1000;

const nextGapByOwner = new Map();

export function isBulkKind(kind) {
  return BULK_KINDS.has(String(kind || ""));
}

export function randomIntervalMs(minMs, maxMs) {
  const min = Math.max(0, Number(minMs) || 0);
  const max = Math.max(min, Number(maxMs) || min);
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function rememberNextGap(ownerId, nextAt) {
  if (!ownerId || !nextAt) return;
  nextGapByOwner.set(ownerId, new Date(nextAt));
}

const nextSlotByOwner = new Map();

export function allocateBulkSlot(ownerId, { now = new Date(), intervalMinMs, intervalMaxMs } = {}) {
  const key = ownerId || "_unknown";
  const t = new Date(now).getTime();
  const minMs = Math.max(0, Number(intervalMinMs) || 0);
  const maxMs = Math.max(minMs, Number(intervalMaxMs) || minMs);
  const remembered = nextGapByOwner.get(key);
  const last = nextSlotByOwner.get(key);
  const remMs = remembered && remembered.getTime() > t ? remembered.getTime() : t;
  const lastMs = last ? last.getTime() : 0;

  let at;
  if (last && lastMs > t - minMs) {
    at = Math.max(t, remMs, lastMs) + randomIntervalMs(minMs, maxMs);
  } else {
    at = Math.max(t, remMs);
  }
  const slot = new Date(at);
  nextSlotByOwner.set(key, slot);
  return slot;
}

export function nextAllowedAt({
  now,
  ownerId,
  lastSendAt,
  intervalMinMs,
  intervalMaxMs,
  isBulk,
  bulkCount,
  maxPerHour,
  oldestBulkAt,
}) {
  const t = new Date(now).getTime();
  const options = [];

  const remembered = ownerId ? nextGapByOwner.get(ownerId) : null;
  if (remembered && remembered.getTime() > t) {
    options.push({ at: remembered, reason: "gap" });
  } else if (lastSendAt) {
    const last = new Date(lastSendAt).getTime();
    if (t < last + intervalMinMs) {
      const at = new Date(last + randomIntervalMs(intervalMinMs, intervalMaxMs));
      if (ownerId) rememberNextGap(ownerId, at);
      options.push({ at, reason: "gap" });
    }
  }

  if (isBulk && maxPerHour > 0 && bulkCount >= maxPerHour && oldestBulkAt) {
    const at = new Date(new Date(oldestBulkAt).getTime() + HOUR_MS);
    if (at.getTime() > t) options.push({ at, reason: "hourly" });
  }

  if (!options.length) return { at: null, reason: null };
  options.sort((a, b) => b.at.getTime() - a.at.getTime());
  return options[0];
}

export function summarizeOwnerSends(jobs, eventIds, hourAgo) {
  const mine = jobs.filter((job) => eventIds.has(job.payload?.eventId));
  const last = mine[mine.length - 1];
  const bulk = mine.filter((job) => isBulkKind(job.payload?.kind));
  const bulkInHour = bulk.filter((job) => new Date(job.updatedAt).getTime() >= hourAgo.getTime());
  return {
    lastSendAt: last?.updatedAt || null,
    bulkCount: bulkInHour.length,
    oldestBulkAt: bulkInHour[0]?.updatedAt || null,
  };
}
