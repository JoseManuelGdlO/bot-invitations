import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEventOps, buildUpcomingReminders } from "./event-ops.ts";
import type { ActivityItem, EventData, EventItem, Guest } from "./mock/types.ts";

const now = new Date(2026, 8, 25, 12, 0, 0);

const event = (patch: Partial<EventItem> = {}): EventItem => ({
  id: "boda",
  name: "Boda Ana",
  shortName: "Ana",
  type: "boda",
  hosts: "Ana",
  date: "2026-10-20",
  time: "18:00",
  timezone: "America/Mexico_City",
  venue: "Salón",
  address: "",
  estimatedGuests: 100,
  cover: "",
  status: "activo",
  campaign: {
    status: "done",
    scheduledAt: null,
    launchedAt: "2026-09-20T15:00:00.000Z",
    total: 10,
    processed: 10,
    percent: 100,
  },
  ...patch,
});

test("buildEventOps muestra campaña y recordatorio, y omite confirmaciones", () => {
  const activity: ActivityItem[] = [
    { id: "1", eventId: "boda", text: "María confirmó 2 lugares", at: "hace 4 min", kind: "confirm" },
    { id: "2", eventId: "boda", text: "Recordatorio automático (Primer recordatorio) a María", at: "hace 1 h", kind: "message" },
    { id: "3", eventId: "boda", text: "Sofía envió 10 mensajes iniciales", at: "ayer", kind: "message" },
  ];
  const items = buildEventOps([event()], activity, now);
  assert.deepEqual(
    items.map((item) => item.text),
    ["Recordatorio lanzado", "Campaña lanzada"],
  );
});

test("buildUpcomingReminders lista reglas futuras por evento", () => {
  const data: Record<string, EventData> = {
    boda: {
      ai: {
        assistantName: "Sofía",
        tone: "Elegante",
        formality: 60,
        emojis: "algunos",
        length: "normales",
        openingMessage: "",
        prompt: "",
        rules: [],
        followUpsEnabled: true,
        botEnabled: true,
        followUps: [
          { id: "f1", label: "Primer contacto", when: "30 días antes del evento", days: 30, active: true },
          { id: "f2", label: "Primer recordatorio", when: "7 días después del primer contacto", days: 7, active: true },
          { id: "f4", label: "Último intento", when: "7 días antes del evento", days: 7, active: true },
        ],
      },
      templates: [],
      faqs: [],
    },
  };
  const guests: Guest[] = [
    {
      id: "g1",
      eventId: "boda",
      rep: "María",
      phone: "1",
      invited: 2,
      confirmed: 0,
      table: "",
      family: "",
      guestType: "",
      notes: "",
      tag: "",
      status: "enviado",
      whatsapp: "enviado",
      lastMessage: "",
      lastReply: "",
      lastReplyAt: "",
      followUp: "",
    },
  ];
  const rows = buildUpcomingReminders([event()], data, guests, now);
  assert.deepEqual(
    rows.map((row) => row.label),
    ["Primer recordatorio", "Último intento"],
  );
  assert.equal(rows[0]?.eventName, "Boda Ana");
  assert.match(rows[0]?.when ?? "", /1 pendiente de contestar/);
  assert.equal(rows[0]?.status, "upcoming");
  assert.equal(rows[0]?.dueOn, "2026-09-27");
  assert.equal(rows[1]?.dueOn, "2026-10-13");
  assert.match(rows[0]?.detail ?? "", /Se lanza el/);
});

test("buildUpcomingReminders marca el recordatorio ya enviado", () => {
  const data: Record<string, EventData> = {
    boda: {
      ai: {
        assistantName: "Sofía",
        tone: "Elegante",
        formality: 60,
        emojis: "algunos",
        length: "normales",
        openingMessage: "",
        prompt: "",
        rules: [],
        followUpsEnabled: true,
        botEnabled: true,
        followUps: [
          {
            id: "f2",
            label: "Primer recordatorio",
            when: "7 días después del primer contacto",
            days: 7,
            active: true,
          },
        ],
      },
      templates: [],
      faqs: [],
    },
  };
  const guests: Guest[] = [
    {
      id: "g1",
      eventId: "boda",
      rep: "María",
      phone: "1",
      invited: 2,
      confirmed: 0,
      table: "",
      family: "",
      guestType: "",
      notes: "",
      tag: "",
      status: "enviado",
      whatsapp: "enviado",
      lastMessage: "",
      lastReply: "",
      lastReplyAt: "",
      followUp: "",
    },
  ];
  const activity: ActivityItem[] = [
    {
      id: "r1",
      eventId: "boda",
      text: "Recordatorio automático (Primer recordatorio) a María",
      at: "hace 2 h",
      kind: "message",
    },
  ];
  const launched = event({
    campaign: {
      status: "done",
      scheduledAt: null,
      launchedAt: "2026-09-01T15:00:00.000Z",
      total: 10,
      processed: 10,
      percent: 100,
    },
  });
  const [row] = buildUpcomingReminders([launched], data, guests, now, activity);
  assert.equal(row?.status, "sent");
  assert.match(row?.detail ?? "", /Enviado hace 2 h/);
  assert.match(row?.detail ?? "", /1 pendiente de contestar/);
});

test("buildUpcomingReminders deja de marcar pendiente cuando el invitado contesta", () => {
  const data: Record<string, EventData> = {
    boda: {
      ai: {
        assistantName: "Sofía",
        tone: "Elegante",
        formality: 60,
        emojis: "algunos",
        length: "normales",
        openingMessage: "",
        prompt: "",
        rules: [],
        followUpsEnabled: true,
        botEnabled: true,
        followUps: [
          {
            id: "f2",
            label: "Primer recordatorio",
            when: "7 días después del primer contacto",
            days: 7,
            active: true,
          },
        ],
      },
      templates: [],
      faqs: [],
    },
  };
  const guest: Guest = {
    id: "g1",
    eventId: "boda",
    rep: "María",
    phone: "1",
    invited: 1,
    confirmed: 1,
    table: "",
    family: "",
    guestType: "",
    notes: "",
    tag: "",
    status: "confirmado",
    whatsapp: "respondido",
    lastMessage: "",
    lastReply: "Sí vamos",
    lastReplyAt: "10:40",
    followUp: "",
  };
  const [row] = buildUpcomingReminders([event()], data, [guest], now);
  assert.match(row?.detail ?? "", /Ya contestó/);
  assert.doesNotMatch(row?.detail ?? "", /pendiente de contestar/);
});
