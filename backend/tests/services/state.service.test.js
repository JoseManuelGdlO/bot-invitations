import { loadWithMocks, fakeEvent, fakeGuest } from "../helpers/loadWithMocks.js";

describe("state.service", () => {
  let service;
  let models;

  beforeEach(async () => {
    ({ mod: service, models } = await loadWithMocks("src/services/state.service.js"));
  });

  test("statsFor calcula progreso y tasas", () => {
    const stats = service.statsFor([
      fakeGuest({ invited: 2, confirmed: 2, status: "confirmado", whatsapp: "respondido" }),
      fakeGuest({ id: "gst_2", invited: 2, confirmed: 0, status: "sin_respuesta", whatsapp: "pendiente" }),
    ]);
    expect(stats.people).toBe(4);
    expect(stats.confirmedPeople).toBe(2);
    expect(stats.progress).toBe(50);
  });

  test("buildAnalytics arma timeline y confirmaciones diarias", () => {
    const guests = [fakeGuest({ confirmedAt: new Date("2026-08-24T12:00:00Z"), status: "confirmado" })];
    const conversations = [{ id: "c1" }];
    const messages = [
      { conversationId: "c1", from: "ai", createdAt: new Date("2026-08-24T10:00:00Z") },
      { conversationId: "c1", from: "guest", createdAt: new Date("2026-08-24T10:05:00Z") },
    ];
    const analytics = service.buildAnalytics(guests, conversations, messages);
    expect(analytics.timeline).toHaveLength(4);
    expect(analytics.dailyConfirmations).toHaveLength(7);
  });

  test("loadUserState vacío si no hay eventos", async () => {
    models.Event.findAll.mockResolvedValue([]);
    models.EventMember.findAll.mockResolvedValue([]);
    const state = await service.loadUserState("usr_test_1");
    expect(state.events).toEqual([]);
    expect(state.guests).toEqual([]);
  });

  test("loadUserState serializa eventos accesibles", async () => {
    const event = fakeEvent();
    models.Event.findAll.mockImplementation(async ({ where } = {}) => {
      if (where?.ownerId) return [{ id: event.id }];
      return [event];
    });
    models.EventMember.findAll.mockResolvedValue([]);
    models.Guest.findAll.mockResolvedValue([]);
    models.Conversation.findAll.mockResolvedValue([]);
    models.Message.findAll.mockResolvedValue([]);
    models.AiConfig.findAll.mockResolvedValue([]);
    models.Template.findAll.mockResolvedValue([]);
    models.Faq.findAll.mockResolvedValue([]);
    models.Activity.findAll.mockResolvedValue([]);
    models.EventRolePermission.findAll.mockResolvedValue([]);
    const state = await service.loadUserState("usr_test_1");
    expect(state.events[0].id).toBe(event.slug);
  });
});
