import {
  Activity,
  AiConfig,
  Campaign,
  Conversation,
  Event,
  EventMember,
  EventRolePermission,
  Faq,
  Guest,
  Message,
  Template,
} from "../models/index.js";
import { userEventIds, PERMS } from "./access.service.js";
import {
  serializeActivity,
  serializeAi,
  serializeConversation,
  serializeEvent,
  serializeFaq,
  serializeGuest,
  serializeMember,
  serializeRolePermission,
  serializeTemplate,
} from "../utils/serialize.js";
import { currentCampaignForEvent } from "./campaign.service.js";
import { formatDuration, weekdayLabel } from "../utils/time.js";

export function statsFor(guests) {
  const invitations = guests.length;
  const people = guests.reduce((a, g) => a + g.invited, 0);
  const confirmedPeople = guests.reduce((a, g) => a + g.confirmed, 0);
  const confirmed = guests.filter((g) => g.status === "confirmado").length;
  const partial = guests.filter((g) => g.status === "parcial").length;
  const rejected = guests.filter((g) => g.status === "no_asistira");
  const rejectedPeople = rejected.reduce((a, g) => a + g.invited, 0);
  const noReply = guests.filter((g) =>
    ["enviado", "entregado", "sin_contactar"].includes(g.status),
  );
  const pending = guests.filter((g) =>
    ["seguimiento", "en_conversacion"].includes(g.status),
  );
  const active = guests.filter((g) => g.status === "en_conversacion").length;
  const responded = guests.filter((g) => g.whatsapp === "respondido").length;
  return {
    invitations,
    people,
    confirmedPeople,
    confirmed: confirmed + partial,
    partial,
    rejected: rejected.length,
    rejectedPeople,
    noReply: noReply.length,
    pending: pending.length,
    active,
    progress: people ? Math.round((confirmedPeople / people) * 100) : 0,
    responseRate: invitations ? Math.round((responded / invitations) * 100) : 0,
  };
}

export function buildAnalytics(guests, conversations, messages) {
  const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const counts = Object.fromEntries(days.map((d) => [d, 0]));
  for (const g of guests) {
    if (!g.confirmedAt) continue;
    const label = weekdayLabel(g.confirmedAt);
    if (counts[label] != null) counts[label] += 1;
  }
  const dailyConfirmations = days.map((day) => ({ day, confirmaciones: counts[day] }));

  const sent = messages.filter((m) => m.from !== "guest").length;
  const replies = messages.filter((m) => m.from === "guest").length;
  const confirmed = guests.filter((g) => ["confirmado", "parcial"].includes(g.status)).length;

  const timeline = [
    { label: "Mensajes iniciales enviados", value: guests.filter((g) => g.contactedAt).length || sent, at: "Registrado" },
    { label: "Primeras respuestas recibidas", value: replies, at: "Registrado" },
    { label: "Conversaciones abiertas", value: conversations.length, at: "Actual" },
    { label: "Confirmaciones cerradas", value: confirmed, at: "Actual" },
  ];

  const durations = [];
  const byConv = new Map();
  for (const m of messages) {
    if (!byConv.has(m.conversationId)) byConv.set(m.conversationId, []);
    byConv.get(m.conversationId).push(m);
  }
  for (const list of byConv.values()) {
    const ordered = [...list].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const firstOut = ordered.find((m) => m.from !== "guest");
    const firstIn = ordered.find((m) => m.from === "guest");
    if (firstOut && firstIn) {
      durations.push(new Date(firstIn.createdAt) - new Date(firstOut.createdAt));
    }
  }
  const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

  return {
    dailyConfirmations,
    timeline,
    averageResponseTime: durations.length ? formatDuration(avg) : "—",
  };
}

export async function loadUserState(userId) {
  const ids = await userEventIds(userId);
  if (!ids.length) {
    return {
      events: [],
      guests: [],
      conversations: [],
      data: {},
      activity: [],
      members: {},
      rolePermissions: {},
      analytics: {},
      eventAccess: {},
    };
  }

  const events = await Event.findAll({ where: { id: ids }, order: [["createdAt", "DESC"]] });
  const slugById = Object.fromEntries(events.map((e) => [e.id, e.slug]));

  const [members, perms, activities, campaigns] = await Promise.all([
    EventMember.findAll({ where: { eventId: ids, removedAt: null }, order: [["createdAt", "ASC"]] }),
    EventRolePermission.findAll({ where: { eventId: ids } }),
    Activity.findAll({ where: { eventId: ids }, order: [["createdAt", "DESC"]], limit: 40 }),
    Campaign.findAll({ where: { eventId: ids }, order: [["createdAt", "DESC"]] }),
  ]);

  const accessByEventId = {};
  for (const event of events) {
    accessByEventId[event.id] = resolveEventAccess(event, userId, members, perms);
  }

  const guestEventIds = eventIdsWithPerm(events, accessByEventId, PERMS.VIEW_GUESTS);
  const chatEventIds = eventIdsWithPerm(events, accessByEventId, PERMS.VIEW_CHATS);
  const aiEventIds = eventIdsWithPerm(events, accessByEventId, PERMS.CONFIG_AI);

  const [guests, conversations, ais, templates, faqs] = await Promise.all([
    findAllByEventIds(Guest, guestEventIds, { order: [["createdAt", "ASC"]] }),
    findAllByEventIds(Conversation, chatEventIds, { order: [["updatedAt", "DESC"]] }),
    findAllByEventIds(AiConfig, aiEventIds),
    findAllByEventIds(Template, aiEventIds, { order: [["createdAt", "ASC"]] }),
    findAllByEventIds(Faq, aiEventIds, { order: [["createdAt", "ASC"]] }),
  ]);

  const convIds = conversations.map((c) => c.id);
  const messages = convIds.length
    ? await Message.findAll({ where: { conversationId: convIds }, order: [["createdAt", "ASC"]] })
    : [];

  const messagesByConv = new Map();
  for (const m of messages) {
    if (!messagesByConv.has(m.conversationId)) messagesByConv.set(m.conversationId, []);
    messagesByConv.get(m.conversationId).push(m);
  }

  const data = {};
  const membersByEvent = {};
  const permsByEvent = {};
  const analytics = {};
  const eventAccess = {};

  for (const event of events) {
    const access = accessByEventId[event.id];
    const viewGuests = canAccess(access, PERMS.VIEW_GUESTS);
    const viewChats = canAccess(access, PERMS.VIEW_CHATS);
    const configAi = canAccess(access, PERMS.CONFIG_AI);
    const manageTeam = canAccess(access, PERMS.MANAGE_TEAM);
    const ai = ais.find((a) => a.eventId === event.id);
    data[event.slug] = {
      ai: configAi && ai ? serializeAi(ai) : defaultEmptyAi(),
      templates: configAi ? templates.filter((t) => t.eventId === event.id).map(serializeTemplate) : [],
      faqs: configAi ? faqs.filter((f) => f.eventId === event.id).map(serializeFaq) : [],
    };
    const eventMembers = members.filter((m) => m.eventId === event.id && !m.removedAt);
    membersByEvent[event.slug] = manageTeam
      ? eventMembers.map((m) => serializeMember(m, event.ownerId))
      : [];
    permsByEvent[event.slug] = perms.filter((p) => p.eventId === event.id).map(serializeRolePermission);
    const eventGuests = viewGuests ? guests.filter((g) => g.eventId === event.id) : [];
    const eventConvs = viewChats ? conversations.filter((c) => c.eventId === event.id) : [];
    const eventMsgs = viewChats ? eventConvs.flatMap((c) => messagesByConv.get(c.id) || []) : [];
    analytics[event.slug] = buildAnalytics(eventGuests, eventConvs, eventMsgs);
    eventAccess[event.slug] = access;
  }

  return {
    events: events.map((event) =>
      serializeEvent(event, currentCampaignForEvent(campaigns, event.id)),
    ),
    guests: guests.map((g) =>
      serializeGuestForState(g, slugById[g.eventId], {
        viewGuests: canAccess(accessByEventId[g.eventId], PERMS.VIEW_GUESTS),
        viewChats: canAccess(accessByEventId[g.eventId], PERMS.VIEW_CHATS),
      }),
    ),
    conversations: conversations.map((c) =>
      serializeConversation(
        c,
        slugById[c.eventId],
        canAccess(accessByEventId[c.eventId], PERMS.VIEW_CHATS) ? messagesByConv.get(c.id) || [] : [],
      ),
    ),
    data,
    activity: activities.map((a) => serializeActivity(a, slugById[a.eventId])),
    members: membersByEvent,
    rolePermissions: permsByEvent,
    analytics,
    eventAccess,
  };
}

function canAccess(access, permission) {
  if (!access) return false;
  if (access.permissions.includes(PERMS.EDIT_ALL)) return true;
  return access.permissions.includes(permission);
}

function resolveEventAccess(event, userId, members, perms) {
  const isOwner = event.ownerId === userId;
  const self = members.find((m) => m.eventId === event.id && m.userId === userId && !m.removedAt);
  const role = isOwner ? "Administrador" : self?.role || null;
  const permissions = role
    ? perms.filter((p) => p.eventId === event.id && p.role === role && p.enabled).map((p) => p.permission)
    : [];
  return {
    role,
    permissions: isOwner && !permissions.includes(PERMS.EDIT_ALL)
      ? [...new Set([...permissions, PERMS.EDIT_ALL])]
      : permissions,
    isOwner,
  };
}

function eventIdsWithPerm(events, accessByEventId, permission) {
  return events.filter((event) => canAccess(accessByEventId[event.id], permission)).map((event) => event.id);
}

function findAllByEventIds(Model, eventIds, extra = {}) {
  if (!eventIds.length) return [];
  return Model.findAll({ where: { eventId: eventIds }, ...extra });
}

function serializeGuestForState(guest, slug, { viewGuests, viewChats }) {
  const row = serializeGuest(guest, slug);
  if (!viewGuests) row.phone = "";
  if (!viewChats) {
    row.lastMessage = "";
    row.lastReply = "";
    row.lastReplyAt = "";
  }
  return row;
}

function defaultEmptyAi() {
  return {
    assistantName: "Sofía",
    tone: "Elegante",
    formality: 60,
    emojis: "algunos",
    length: "normales",
    openingMessage: "",
    prompt: "",
    rules: [],
    followUps: [],
  };
}
