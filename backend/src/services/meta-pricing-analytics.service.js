import { httpError } from "../utils/http-error.js";
import { getWabaPricingAnalytics } from "./meta-graph.client.js";
import { resolveActiveWhatsappMetaByOwner } from "./whatsapp-meta.service.js";

export const PRICING_RANGES = Object.freeze({
  "7d": 7,
  "30d": 30,
  "90d": 90,
});

/** Unix start mínimo de pricing_analytics (1 dic 2025 10:00 PT). */
export const PRICING_ANALYTICS_MIN_START = 1764612000;

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

const FREE_CATEGORIES = new Set([
  "SERVICE",
  "FREE_ENTRY",
  "FREE_ENTRY_POINT",
  "FREE_CUSTOMER_SERVICE",
  "FREE_TIER",
]);

export function clearPricingAnalyticsCache() {
  cache.clear();
}

export function parsePricingRange(raw) {
  const key = String(raw || "30d").trim().toLowerCase() || "30d";
  if (!Object.prototype.hasOwnProperty.call(PRICING_RANGES, key)) {
    throw httpError(400, "range debe ser 7d, 30d o 90d.");
  }
  const days = PRICING_RANGES[key];
  const endMs = Date.now();
  const startMs = endMs - days * 24 * 60 * 60 * 1000;
  const end = Math.floor(endMs / 1000);
  let start = Math.floor(startMs / 1000);
  if (start < PRICING_ANALYTICS_MIN_START) start = PRICING_ANALYTICS_MIN_START;
  return {
    range: key,
    start,
    end,
  };
}

function asNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dayKeyFromUnix(unix) {
  const ms = Number(unix) * 1000;
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

function extractDataPoints(payload) {
  const root = payload?.pricing_analytics;
  const rows = Array.isArray(root?.data) ? root.data : Array.isArray(root) ? root : [];
  const points = [];
  for (const row of rows) {
    const list = Array.isArray(row?.data_points) ? row.data_points : [];
    for (const point of list) {
      if (point && typeof point === "object") points.push(point);
    }
  }
  return points;
}

function isFreePoint(point) {
  const category = String(point.pricing_category || point.conversation_category || "").trim().toUpperCase();
  const pricingType = String(point.pricing_type || "").trim().toUpperCase();
  if (FREE_CATEGORIES.has(category)) return true;
  if (category.startsWith("FREE_")) return true;
  if (pricingType === "FREE" || pricingType.includes("FREE")) return true;
  const cost = asNumber(point.cost);
  if (cost === 0) return true;
  return false;
}

function categoryLabel(point) {
  const raw = String(point.pricing_category || point.conversation_category || "UNKNOWN").trim();
  return raw || "UNKNOWN";
}

/**
 * Pure aggregation of Meta pricing_analytics data_points into the UI DTO.
 * Exported for unit tests.
 */
export function normalizePricingAnalytics({ range, start, end, payload } = {}) {
  const points = extractDataPoints(payload);
  let sawCostField = false;
  let totalCost = 0;
  let totalVolume = 0;
  let freeVolume = 0;
  let paidVolume = 0;
  let currency = null;

  const byDay = new Map();
  const byCategory = new Map();

  for (const point of points) {
    const volume = asNumber(point.volume) ?? asNumber(point.conversation) ?? 0;
    const cost = asNumber(point.cost);
    if (cost != null) {
      sawCostField = true;
      totalCost += cost;
    }
    totalVolume += volume;

    const free = isFreePoint(point);
    if (free) freeVolume += volume;
    else paidVolume += volume;

    if (!currency && point.currency) currency = String(point.currency).trim() || null;

    const day = dayKeyFromUnix(point.start);
    if (day) {
      const prev = byDay.get(day) || { day, cost: 0, volume: 0 };
      prev.volume += volume;
      if (cost != null) prev.cost += cost;
      byDay.set(day, prev);
    }

    const cat = categoryLabel(point);
    const catPrev = byCategory.get(cat) || { category: cat, cost: 0, volume: 0, sawCost: false };
    catPrev.volume += volume;
    if (cost != null) {
      catPrev.cost += cost;
      catPrev.sawCost = true;
    }
    byCategory.set(cat, catPrev);
  }

  const costAvailable = sawCostField;
  const series = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  const byCategoryList = [...byCategory.values()]
    .map((row) => ({
      category: row.category,
      volume: row.volume,
      cost: costAvailable && row.sawCost ? row.cost : costAvailable ? 0 : null,
    }))
    .sort((a, b) => b.volume - a.volume || a.category.localeCompare(b.category));

  const avg =
    costAvailable && totalVolume > 0 ? totalCost / totalVolume : costAvailable ? 0 : null;

  return {
    range: String(range || "30d"),
    start: Number(start) || 0,
    end: Number(end) || 0,
    currency,
    costAvailable,
    kpis: {
      totalCost: costAvailable ? totalCost : null,
      totalVolume,
      avgCostPerMessage: avg,
      freeVolume,
      paidVolume,
    },
    series,
    byCategory: byCategoryList,
  };
}

function cacheKey(ownerUserId, range) {
  return `${ownerUserId}:${range}`;
}

export async function getOwnerPricingAnalytics({ ownerUserId, range: rangeRaw } = {}) {
  const ownerId = String(ownerUserId || "").trim();
  if (!ownerId) throw httpError(400, "Falta el usuario.");

  const { range, start, end } = parsePricingRange(rangeRaw);
  const key = cacheKey(ownerId, range);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return { ...hit.value, cached: true };
  }

  const { credentials } = await resolveActiveWhatsappMetaByOwner(ownerId);
  const payload = await getWabaPricingAnalytics({
    wabaId: credentials.wabaId,
    token: credentials.accessToken,
    start,
    end,
    granularity: "DAILY",
    metricTypes: ["VOLUME"],
  });

  const value = normalizePricingAnalytics({ range, start, end, payload });
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return { ...value, cached: false };
}
