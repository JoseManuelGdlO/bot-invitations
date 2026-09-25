import { collectLaunchNotices, isWithinLaunchNotice } from "../../src/services/launch-notice.js";

const now = new Date(2026, 8, 25, 11, 0, 0);

function event(overrides = {}) {
  return {
    id: "evt_1",
    ownerId: "usr_1",
    slug: "boda-ana",
    name: "Boda Ana",
    date: "2026-10-20",
    status: "activo",
    ...overrides,
  };
}

describe("launch-notice", () => {
  test("incluye la campaña de hoy o mañana y omite las lejanas", () => {
    const notices = collectLaunchNotices({
      now,
      events: [event(), event({ id: "evt_2", slug: "otro", name: "Otro", status: "borrador" })],
      campaigns: [
        { id: "c1", eventId: "evt_1", status: "queued", scheduledAt: "2026-09-26" },
        { id: "c2", eventId: "evt_2", status: "queued", scheduledAt: "2026-09-25" },
        { id: "c3", eventId: "evt_1", status: "queued", scheduledAt: "2026-10-01" },
        { id: "c4", eventId: "evt_1", status: "running", scheduledAt: "2026-09-26" },
      ],
    });
    expect(notices.map((row) => row.dedupeKey).sort()).toEqual([
      "campaign:c1:2026-09-26",
      "campaign:c2:2026-09-25",
    ]);
    expect(notices.find((row) => row.dedupeKey.startsWith("campaign:c1"))?.body).toContain("mañana");
    expect(notices.find((row) => row.dedupeKey.startsWith("campaign:c2"))?.body).toContain("hoy");
  });

  test("no avisa campañas de eventos finalizados", () => {
    const notices = collectLaunchNotices({
      now,
      events: [event({ status: "finalizado" })],
      campaigns: [{ id: "c1", eventId: "evt_1", status: "queued", scheduledAt: "2026-09-26" }],
    });
    expect(notices).toEqual([]);
  });

  test("agrupa recordatorios de mañana y omite pausados, enviados e inactivos", () => {
    const notices = collectLaunchNotices({
      now,
      events: [event()],
      aiByEventId: new Map([
        [
          "evt_1",
          {
            followUpsEnabled: true,
            followUps: [
              { id: "f1", label: "Primer contacto", days: 30, when: "30 días antes del evento", active: true },
              { id: "f2", label: "Primer recordatorio", days: 7, when: "7 días después del primer contacto", active: true },
              { id: "f3", label: "Segundo recordatorio", days: 14, when: "14 días después del primer contacto", active: false },
            ],
          },
        ],
      ]),
      pausedGuestIds: new Set(["gst_paused"]),
      guests: [
        { id: "gst_1", eventId: "evt_1", status: "enviado", phone: "5511111111", contactedAt: "2026-09-19", followUpsSent: [] },
        { id: "gst_2", eventId: "evt_1", status: "entregado", phone: "5522222222", contactedAt: "2026-09-19", followUpsSent: [] },
        { id: "gst_sent", eventId: "evt_1", status: "enviado", phone: "5533333333", contactedAt: "2026-09-19", followUpsSent: ["f2"] },
        { id: "gst_paused", eventId: "evt_1", status: "enviado", phone: "5544444444", contactedAt: "2026-09-19", followUpsSent: [] },
        { id: "gst_nophone", eventId: "evt_1", status: "enviado", phone: "", contactedAt: "2026-09-19", followUpsSent: [] },
      ],
    });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      kind: "reminder",
      dedupeKey: "reminder:evt_1:f2:2026-09-26",
      userId: "usr_1",
    });
    expect(notices[0].body).toContain("2 recordatorios");
    expect(notices[0].body).toContain("Mañana");
  });

  test("avisa el recontacto a indecisos del día", () => {
    const notices = collectLaunchNotices({
      now,
      events: [event()],
      aiByEventId: new Map([
        [
          "evt_1",
          {
            followUpsEnabled: true,
            followUps: [
              { id: "indeciso", label: "Recontacto a indecisos", days: 3, when: "3 días después de marcar seguimiento", active: true },
            ],
          },
        ],
      ]),
      guests: [
        { id: "gst_1", eventId: "evt_1", status: "seguimiento", phone: "5511111111", followUp: "25/09/2026", followUpsSent: [] },
      ],
    });
    expect(notices).toHaveLength(1);
    expect(notices[0].kind).toBe("followup");
    expect(notices[0].body).toContain("Hoy");
    expect(notices[0].body).toContain("1 recontacto");
  });

  test("no arma recordatorios si el evento no está activo o los seguimientos están apagados", () => {
    const shared = {
      now,
      aiByEventId: new Map([
        ["evt_1", { followUpsEnabled: false, followUps: [{ id: "f2", label: "Primer recordatorio", days: 7, when: "7 días después del primer contacto", active: true }] }],
      ]),
      guests: [
        { id: "gst_1", eventId: "evt_1", status: "enviado", phone: "5511111111", contactedAt: "2026-09-19", followUpsSent: [] },
      ],
    };
    expect(collectLaunchNotices({ ...shared, events: [event()] })).toEqual([]);
    expect(
      collectLaunchNotices({
        ...shared,
        events: [event({ status: "borrador" })],
        aiByEventId: new Map([
          ["evt_1", { followUpsEnabled: true, followUps: [{ id: "f2", label: "Primer recordatorio", days: 7, when: "7 días después del primer contacto", active: true }] }],
        ]),
      }),
    ).toEqual([]);
  });

  test("isWithinLaunchNotice solo cubre hoy y mañana", () => {
    expect(isWithinLaunchNotice("2026-09-25", now)).toBe(true);
    expect(isWithinLaunchNotice("2026-09-26", now)).toBe(true);
    expect(isWithinLaunchNotice("2026-09-27", now)).toBe(false);
    expect(isWithinLaunchNotice("2026-09-24", now)).toBe(false);
  });
});
