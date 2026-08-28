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

  test("loadUserState no carga mensajes de toda la tabla", async () => {
    const event = fakeEvent();
    const guest = fakeGuest({ lastMessage: "último", lastReply: "ok" });
    const conv = {
      id: "cnv_1",
      eventId: event.id,
      guestId: guest.id,
      aiPaused: false,
      unread: 0,
    };
    const message = {
      id: "msg_1",
      conversationId: "cnv_1",
      from: "guest",
      text: "hola",
      at: "10:00",
      createdAt: new Date("2026-08-24T10:00:00Z"),
    };
    stubOwnedEvent(models, event);
    models.Guest.findAll.mockResolvedValue([guest]);
    models.Conversation.findAll.mockResolvedValue([conv]);
    models.Message.findAll.mockResolvedValue([message]);
    const state = await service.loadUserState("usr_test_1");
    expect(models.Message.findAll).toHaveBeenCalledWith({
      where: { conversationId: ["cnv_1"] },
      order: [["createdAt", "ASC"]],
    });
    expect(state.guests[0].phone).toBe(guest.phone);
    expect(state.conversations[0].messages[0].text).toBe("hola");
  });

  test("loadUserState omite invitados, chats y miembros sin permiso", async () => {
    const event = fakeEvent({ ownerId: "usr_owner" });
    const guest = fakeGuest({
      phone: "5511111111",
      lastMessage: "texto privado",
      lastReply: "respuesta privada",
      lastReplyAt: "10:01",
    });
    const conv = { id: "cnv_1", eventId: event.id, guestId: guest.id, aiPaused: false, unread: 1 };
    stubMemberEvent(models, event, {
      role: "Wedding Planner",
      perms: ["Editar evento", "Configurar asistente", "Responder conversaciones", "Exportar datos"],
      extraMembers: [
        {
          id: "mem_other",
          eventId: event.id,
          userId: "usr_other",
          name: "Luis",
          email: "luis@test.com",
          role: "Asistente",
          initials: "LT",
          removedAt: null,
        },
      ],
    });
    models.Guest.findAll.mockResolvedValue([guest]);
    models.Conversation.findAll.mockResolvedValue([conv]);
    models.Message.findAll.mockResolvedValue([
      { id: "msg_1", conversationId: "cnv_1", from: "guest", text: "secreto", at: "10:00" },
    ]);
    models.AiConfig.findAll.mockResolvedValue([
      {
        eventId: event.id,
        assistantName: "Sofía",
        tone: "Elegante",
        formality: 60,
        emojis: "algunos",
        length: "normales",
        openingMessage: "abrir",
        prompt: "instrucciones secretas",
        rules: [],
        followUps: [],
      },
    ]);
    models.Template.findAll.mockResolvedValue([{ id: "tpl_1", eventId: event.id, category: "Primer contacto", title: "Hola", body: "cuerpo" }]);
    models.Faq.findAll.mockResolvedValue([{ id: "faq_1", eventId: event.id, q: "¿Dónde?", a: "Allá" }]);

    const state = await service.loadUserState("usr_test_1");

    expect(models.Guest.findAll).not.toHaveBeenCalled();
    expect(models.Conversation.findAll).not.toHaveBeenCalled();
    expect(models.Message.findAll).not.toHaveBeenCalled();
    expect(state.guests).toEqual([]);
    expect(state.conversations).toEqual([]);
    expect(state.members[event.slug]).toEqual([]);
    expect(state.data[event.slug].ai.prompt).toBe("instrucciones secretas");
    expect(state.data[event.slug].templates).toHaveLength(1);
    expect(state.data[event.slug].faqs).toHaveLength(1);
    expect(state.eventAccess[event.slug].role).toBe("Wedding Planner");
  });

  test("loadUserState entrega invitados y chats si el rol los puede ver", async () => {
    const event = fakeEvent({ ownerId: "usr_owner" });
    const guest = fakeGuest({
      phone: "5511111111",
      lastMessage: "último",
      lastReply: "ok",
      lastReplyAt: "10:01",
    });
    const conv = { id: "cnv_1", eventId: event.id, guestId: guest.id, aiPaused: false, unread: 0 };
    stubMemberEvent(models, event, {
      role: "Asistente",
      perms: ["Ver invitados", "Ver conversaciones"],
    });
    models.Guest.findAll.mockResolvedValue([guest]);
    models.Conversation.findAll.mockResolvedValue([conv]);
    models.Message.findAll.mockResolvedValue([
      { id: "msg_1", conversationId: "cnv_1", from: "guest", text: "hola", at: "10:00" },
    ]);
    models.AiConfig.findAll.mockResolvedValue([
      {
        eventId: event.id,
        assistantName: "Sofía",
        tone: "Elegante",
        formality: 60,
        emojis: "algunos",
        length: "normales",
        openingMessage: "abrir",
        prompt: "no deberías ver esto",
        rules: [],
        followUps: [],
      },
    ]);

    const state = await service.loadUserState("usr_test_1");

    expect(models.Guest.findAll).toHaveBeenCalledWith({
      where: { eventId: [event.id] },
      order: [["createdAt", "ASC"]],
    });
    expect(models.Conversation.findAll).toHaveBeenCalledWith({
      where: { eventId: [event.id] },
      order: [["updatedAt", "DESC"]],
    });
    expect(models.Message.findAll).toHaveBeenCalledWith({
      where: { conversationId: ["cnv_1"] },
      order: [["createdAt", "ASC"]],
    });
    expect(models.AiConfig.findAll).not.toHaveBeenCalled();
    expect(state.guests[0].phone).toBe("5511111111");
    expect(state.guests[0].lastMessage).toBe("último");
    expect(state.conversations[0].messages[0].text).toBe("hola");
    expect(state.data[event.slug].ai.prompt).toBe("");
    expect(state.members[event.slug]).toEqual([]);
  });

  test("loadUserState oculta textos de chat si solo hay VIEW_GUESTS", async () => {
    const event = fakeEvent({ ownerId: "usr_owner" });
    const guest = fakeGuest({
      phone: "5511111111",
      lastMessage: "último",
      lastReply: "respuesta",
      lastReplyAt: "10:01",
    });
    stubMemberEvent(models, event, {
      role: "Coordinador",
      perms: ["Ver invitados", "Responder conversaciones", "Registrar confirmaciones"],
    });
    models.Guest.findAll.mockResolvedValue([guest]);
    models.Conversation.findAll.mockResolvedValue([
      { id: "cnv_1", eventId: event.id, guestId: guest.id, aiPaused: false, unread: 0 },
    ]);
    models.Message.findAll.mockResolvedValue([
      { id: "msg_1", conversationId: "cnv_1", from: "guest", text: "hola", at: "10:00" },
    ]);

    const state = await service.loadUserState("usr_test_1");

    expect(state.guests).toHaveLength(1);
    expect(state.guests[0].phone).toBe("5511111111");
    expect(state.guests[0].lastMessage).toBe("");
    expect(state.guests[0].lastReply).toBe("");
    expect(state.guests[0].lastReplyAt).toBe("");
    expect(state.conversations).toEqual([]);
    expect(models.Conversation.findAll).not.toHaveBeenCalled();
    expect(models.Message.findAll).not.toHaveBeenCalled();
  });
});

function stubOwnedEvent(models, event) {
  models.Event.findAll.mockImplementation(async ({ where } = {}) => {
    if (where?.ownerId) return [{ id: event.id }];
    return [event];
  });
  models.EventMember.findAll.mockResolvedValue([]);
  models.EventRolePermission.findAll.mockResolvedValue([]);
  models.AiConfig.findAll.mockResolvedValue([]);
  models.Template.findAll.mockResolvedValue([]);
  models.Faq.findAll.mockResolvedValue([]);
  models.Activity.findAll.mockResolvedValue([]);
}

function stubMemberEvent(models, event, { role, perms, extraMembers = [] }) {
  const self = {
    id: "mem_self",
    eventId: event.id,
    userId: "usr_test_1",
    name: "Ana Test",
    email: "ana@test.com",
    role,
    initials: "AT",
    removedAt: null,
  };
  models.Event.findAll.mockImplementation(async ({ where } = {}) => {
    if (where?.ownerId) return [];
    return [event];
  });
  models.EventMember.findAll.mockImplementation(async ({ where } = {}) => {
    if (where?.userId && !where?.eventId) return [{ eventId: event.id }];
    return [self, ...extraMembers];
  });
  models.EventRolePermission.findAll.mockResolvedValue(
    perms.map((permission) => ({ eventId: event.id, role, permission, enabled: true })),
  );
  models.AiConfig.findAll.mockResolvedValue([]);
  models.Template.findAll.mockResolvedValue([]);
  models.Faq.findAll.mockResolvedValue([]);
  models.Activity.findAll.mockResolvedValue([]);
}
