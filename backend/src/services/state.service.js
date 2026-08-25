import {
  Activity,
  AiConfig,
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
import { formatDuration, weekdayLabel } from "../utils/time.js";

export function statsFor(guests) {
  const invitations = guests.length;
  const people = guests.reduce((a, g) => a + g.invited, 0);
  const confirmedPeople = guests.reduce((a, g) => a + g.confirmed, 0);
  const confirmed = guests.filter((g) => g.status === "confirmado").length;
  const partial = guests.filter((g) => g.status === "parcial").length;
  const rejected = guests.filter((g) => g.status === "no_asistira");
  const rejectedPeople = rejected.reduce((a, g) => a + g.invited, 0);
  const noReply = guests.filter((g) => ["sin_respuesta", "enviado", "entregado", "sin_contactar"].includes(g.status));
  const pending = guests.filter((g) => ["seguimiento", "respondio", "en_conversacion"].includes(g.status));
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

  const [guests, conversations, messages, ais, templates, faqs, activities, members, perms] = await Promise.all([
    Guest.findAll({ where: { eventId: ids }, order: [["createdAt", "ASC"]] }),
    Conversation.findAll({ where: { eventId: ids }, order: [["updatedAt", "DESC"]] }),
    Message.findAll({ order: [["createdAt", "ASC"]] }),
    AiConfig.findAll({ where: { eventId: ids } }),
    Template.findAll({ where: { eventId: ids }, order: [["createdAt", "ASC"]] }),
    Faq.findAll({ where: { eventId: ids }, order: [["createdAt", "ASC"]] }),
    Activity.findAll({ where: { eventId: ids }, order: [["createdAt", "DESC"]], limit: 40 }),
    EventMember.findAll({ where: { eventId: ids }, order: [["createdAt", "ASC"]] }),
    EventRolePermission.findAll({ where: { eventId: ids } }),
  ]);

  const convIds = new Set(conversations.map((c) => c.id));
  const messagesByConv = new Map();
  for (const m of messages) {
    if (!convIds.has(m.conversationId)) continue;
    if (!messagesByConv.has(m.conversationId)) messagesByConv.set(m.conversationId, []);
    messagesByConv.get(m.conversationId).push(m);
  }

  const data = {};
  const membersByEvent = {};
  const permsByEvent = {};
  const analytics = {};
  const eventAccess = {};

  for (const event of events) {
    const ai = ais.find((a) => a.eventId === event.id);
    data[event.slug] = {
      ai: ai ? serializeAi(ai) : defaultEmptyAi(),
      templates: templates.filter((t) => t.eventId === event.id).map(serializeTemplate),
      faqs: faqs.filter((f) => f.eventId === event.id).map(serializeFaq),
    };
    const eventMembers = members.filter((m) => m.eventId === event.id);
    membersByEvent[event.slug] = eventMembers.map((m) => serializeMember(m, event.ownerId));
    permsByEvent[event.slug] = perms.filter((p) => p.eventId === event.id).map(serializeRolePermission);
    const eventGuests = guests.filter((g) => g.eventId === event.id);
    const eventConvs = conversations.filter((c) => c.eventId === event.id);
    const eventMsgs = eventConvs.flatMap((c) => messagesByConv.get(c.id) || []);
    analytics[event.slug] = buildAnalytics(eventGuests, eventConvs, eventMsgs);
    const isOwner = event.ownerId === userId;
    const self = eventMembers.find((m) => m.userId === userId);
    const role = isOwner ? "Administrador" : self?.role || null;
    const permissions = role
      ? perms.filter((p) => p.eventId === event.id && p.role === role && p.enabled).map((p) => p.permission)
      : [];
    eventAccess[event.slug] = {
      role,
      permissions: isOwner && !permissions.includes(PERMS.EDIT_ALL)
        ? [...new Set([...permissions, PERMS.EDIT_ALL])]
        : permissions,
      isOwner,
    };
  }

  return {
    events: events.map(serializeEvent),
    guests: guests.map((g) => serializeGuest(g, slugById[g.eventId])),
    conversations: conversations.map((c) =>
      serializeConversation(c, slugById[c.eventId], messagesByConv.get(c.id) || []),
    ),
    data,
    activity: activities.map((a) => serializeActivity(a, slugById[a.eventId])),
    members: membersByEvent,
    rolePermissions: permsByEvent,
    analytics,
    eventAccess,
  };
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
