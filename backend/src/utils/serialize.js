import { formatRelative } from "./time.js";

export function serializeEvent(event) {
  return {
    id: event.slug,
    name: event.name,
    shortName: event.shortName,
    type: event.type,
    hosts: event.hosts,
    date: event.date,
    time: event.time,
    venue: event.venue,
    address: event.address || "",
    estimatedGuests: event.estimatedGuests,
    cover: event.cover,
    status: event.status,
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
    status: guest.status,
    whatsapp: guest.whatsapp,
    lastMessage: guest.lastMessage || "",
    lastReply: guest.lastReply || "",
    lastReplyAt: guest.lastReplyAt || "",
    followUp: guest.followUp || "",
  };
}

export function serializeMessage(message) {
  return {
    id: message.id,
    from: message.from,
    text: message.text,
    at: message.at,
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
    prompt: ai.prompt || "",
    rules: ai.rules || [],
    followUps: ai.followUps || [],
  };
}

export function serializeTemplate(t) {
  return { id: t.id, category: t.category, title: t.title, body: t.body };
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
