import { formatRelative } from "./time.js";
import { resolveEventTimezone } from "./timezone.js";
import { extraInstructions } from "../services/bot/prompt.service.js";
import { mergeFollowUps, normalizeFollowUp } from "../services/follow-up.service.js";

function dateOnly(value) {
  if (!value) return null;
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toCampaignSnapshot(campaign) {
  if (!campaign) {
    return {
      status: "idle",
      scheduledAt: null,
      launchedAt: null,
      total: 0,
      processed: 0,
      percent: 0,
    };
  }
  const total = Number(campaign.total) || 0;
  const processed = Number(campaign.processed) || 0;
  const status =
    campaign.status === "queued"
      ? "scheduled"
      : campaign.status === "running"
        ? "running"
        : campaign.status === "done"
          ? "done"
          : "idle";
  const percent = total
    ? Math.min(100, Math.round((processed / total) * 100))
    : status === "done"
      ? 100
      : 0;
  return {
    status,
    scheduledAt: dateOnly(campaign.scheduledAt),
    launchedAt: campaign.launchedAt ? new Date(campaign.launchedAt).toISOString() : null,
    total,
    processed,
    percent,
  };
}

export function serializeEvent(event, campaign) {
  return {
    id: event.slug,
    name: event.name,
    shortName: event.shortName,
    type: event.type,
    hosts: event.hosts,
    date: event.date,
    time: event.time,
    timezone: resolveEventTimezone(event.timezone),
    venue: event.venue,
    address: event.address || "",
    estimatedGuests: event.estimatedGuests,
    cover: event.cover,
    status: event.status,
    campaign: toCampaignSnapshot(campaign),
  };
}

export function serializeGuest(guest, eventSlug) {
  return {
    id: guest.id,
    eventId: eventSlug,
    rep: guest.rep,
    phone: guest.phone,
    invited: guest.invited,
    confirmed: guest.confirmed,
    table: guest.table || "",
    family: guest.family || "",
    guestType: guest.guestType || "",
    notes: guest.notes || "",
    tag: guest.tag || "Sin etiqueta",
    customData:
      guest.customData && typeof guest.customData === "object" && !Array.isArray(guest.customData)
        ? guest.customData
        : {},
    status: guest.status,
    whatsapp: guest.whatsapp,
    lastMessage: guest.lastMessage || "",
    lastReply: guest.lastReply || "",
    lastReplyAt: guest.lastReplyAt || "",
    followUp: guest.followUp || "",
  };
}

export function serializeMessage(message) {
  const createdAtRaw = message.createdAt;
  const createdAtDate = createdAtRaw ? new Date(createdAtRaw) : null;
  const createdAt =
    createdAtDate && !Number.isNaN(createdAtDate.getTime()) ? createdAtDate.toISOString() : null;
  return {
    id: message.id,
    from: message.from,
    text: message.text,
    at: message.at,
    createdAt,
    kind: message.kind || null,
  };
}

export function serializeConversation(conv, eventSlug, messages = []) {
  return {
    id: conv.id,
    eventId: eventSlug,
    guestId: conv.guestId,
    aiPaused: conv.aiPaused,
    unread: conv.unread,
    messages: messages.map(serializeMessage),
  };
}

export function serializeAi(ai) {
  return {
    assistantName: ai.assistantName,
    tone: ai.tone,
    formality: ai.formality,
    emojis: ai.emojis,
    length: ai.length,
    openingMessage: ai.openingMessage,
    prompt: extraInstructions(ai.prompt),
    rules: ai.rules || [],
    followUps: mergeFollowUps(ai.followUps).map(normalizeFollowUp),
  };
}

export function serializeTemplate(t) {
  const fileName = t.documentFileName || null;
  const hasFile = Boolean(t.documentPath && fileName);
  const bodyVars = Array.isArray(t.bodyVars) ? t.bodyVars : null;
  return {
    id: t.id,
    category: t.category,
    title: t.title,
    body: t.body,
    greetingVar: t.greetingVar || "nombre",
    bodyVars,
    attachDocument: Boolean(t.attachDocument),
    document: hasFile
      ? {
          fileName,
          mime: t.documentMime || null,
          size: Number(t.documentSize) || 0,
        }
      : null,
  };
}

export function serializeFaq(f) {
  return { id: f.id, q: f.q, a: f.a };
}

export function serializeActivity(a, eventSlug) {
  return {
    id: a.id,
    eventId: eventSlug,
    text: a.text,
    at: formatRelative(a.createdAt),
    kind: a.kind,
  };
}

export function serializeMember(m, ownerId) {
  return {
    id: m.id,
    name: m.name,
    email: m.email || "",
    role: m.role,
    initials: m.initials,
    isOwner: !!ownerId && m.userId === ownerId,
  };
}

export function serializeRolePermission(p) {
  return {
    id: p.id,
    role: p.role,
    permission: p.permission,
    enabled: !!p.enabled,
  };
}
