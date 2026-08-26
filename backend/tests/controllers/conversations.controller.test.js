import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks, fakeEvent, fakeGuest, PERMS } from "../helpers/controller.js";
import { createInstance } from "../helpers/models.js";

describe("conversations.controller", () => {
  let controller;
  let models;
  let deliverAiMessage;
  let assertWhatsappReady;

  beforeEach(async () => {
    deliverAiMessage = jest.fn(async () => undefined);
    assertWhatsappReady = jest.fn(async () => undefined);
    ({ mod: controller, models } = await loadWithMocks("src/controllers/conversations.controller.js", {
      extraMocks: {
        "src/services/access.service.js": () => ({
          requireEvent: jest.fn(async () => fakeEvent()),
          userEventIds: jest.fn(async () => ["evt_1"]),
          requirePermission: jest.fn(async () => true),
          PERMS,
        }),
        "src/services/outbound.worker.js": () => ({ enqueueJob: jest.fn(async () => undefined) }),
        "src/services/activity.service.js": () => ({ logActivity: jest.fn(async () => undefined) }),
        "src/services/plans.service.js": () => ({ assertCanSendInvitations: jest.fn() }),
        "src/services/guest-message.service.js": () => ({ deliverAiMessage }),
        "src/services/integration-resolver.service.js": () => ({ assertWhatsappReady }),
      },
    }));
  });

  test("listConversations", async () => {
    models.Conversation.findAll.mockResolvedValue([
      { id: "c1", guestId: "gst_1", aiPaused: false, unread: 0, messages: [] },
    ]);
    const { res } = await callHandler(controller.listConversations, {
      req: createMockReq({ params: { eventId: "boda-ana" } }),
    });
    expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ id: "c1" })]);
  });

  test("toggleConversation 404", async () => {
    models.Conversation.findOne.mockResolvedValue(null);
    const { res } = await callHandler(controller.toggleConversation, {
      req: createMockReq({ params: { conversationId: "x" }, body: { aiPaused: true } }),
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("sendMessage 400 vacío", async () => {
    models.Conversation.findOne.mockResolvedValue(createInstance({ id: "c1", eventId: "evt_1", guestId: "gst_1", aiPaused: false }));
    models.Event.findByPk.mockResolvedValue(fakeEvent());
    const { res } = await callHandler(controller.sendMessage, {
      req: createMockReq({ params: { conversationId: "c1" }, body: { text: "  " } }),
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("launchCampaign envía a sin_contactar", async () => {
    const guest = fakeGuest();
    models.AiConfig.findOne.mockResolvedValue({ openingMessage: "Hola {{nombre}}", assistantName: "Sofía" });
    models.Guest.findAll.mockResolvedValueOnce([guest]).mockResolvedValueOnce([guest]);
    models.Conversation.findOne.mockResolvedValue(null);
    models.Conversation.create.mockResolvedValue(createInstance({ id: "c1" }));
    models.Message.create.mockResolvedValue({});
    const { res } = await callHandler(controller.launchCampaign, {
      req: createMockReq({ params: { eventId: "boda-ana" } }),
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ launched: 1 }));
  });

  test("launchCampaign usa la plantilla Primer contacto", async () => {
    const guest = fakeGuest({ rep: "María López" });
    models.Template.findOne.mockResolvedValue({
      category: "Primer contacto",
      body: "Hola {{nombre}}, ¿podrán acompañarnos a {{evento}}?",
    });
    models.AiConfig.findOne.mockResolvedValue({ openingMessage: "fallback {{nombre}}", assistantName: "Sofía" });
    models.Guest.findAll.mockResolvedValueOnce([guest]).mockResolvedValueOnce([guest]);
    await callHandler(controller.launchCampaign, {
      req: createMockReq({ params: { eventId: "boda-ana" } }),
    });
    expect(deliverAiMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "campaign",
        text: "Hola María, ¿podrán acompañarnos a Boda Ana?",
      }),
    );
  });

  test("segundo launchCampaign no reenvía a quienes ya salieron de sin_contactar", async () => {
    const guest = fakeGuest({ status: "enviado" });
    models.AiConfig.findOne.mockResolvedValue({ openingMessage: "Hola {{nombre}}", assistantName: "Sofía" });
    models.Guest.findAll
      .mockResolvedValueOnce([fakeGuest()])
      .mockResolvedValueOnce([guest])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([guest]);

    const first = await callHandler(controller.launchCampaign, {
      req: createMockReq({ params: { eventId: "boda-ana" } }),
    });
    const second = await callHandler(controller.launchCampaign, {
      req: createMockReq({ params: { eventId: "boda-ana" } }),
    });

    expect(first.res.json).toHaveBeenCalledWith(expect.objectContaining({ launched: 1 }));
    expect(second.res.json).toHaveBeenCalledWith(expect.objectContaining({ launched: 0 }));
    expect(deliverAiMessage).toHaveBeenCalledTimes(1);
    expect(assertWhatsappReady).toHaveBeenCalledTimes(1);
  });
});

describe("conversations.controller GET 403", () => {
  let controller;

  beforeEach(async () => {
    ({ mod: controller } = await loadWithMocks("src/controllers/conversations.controller.js", {
      extraMocks: {
        "src/services/access.service.js": () => ({
          requireEvent: jest.fn(async () => fakeEvent()),
          userEventIds: jest.fn(async () => ["evt_1"]),
          requirePermission: jest.fn(async (_req, res) => {
            res.status(403).json({ error: "No tienes permiso para esta acción." });
            return false;
          }),
          PERMS,
        }),
        "src/services/outbound.worker.js": () => ({ enqueueJob: jest.fn(async () => undefined) }),
        "src/services/activity.service.js": () => ({ logActivity: jest.fn(async () => undefined) }),
        "src/services/plans.service.js": () => ({ assertCanSendInvitations: jest.fn() }),
        "src/services/guest-message.service.js": () => ({
          deliverAiMessage: jest.fn(async () => undefined),
        }),
        "src/services/integration-resolver.service.js": () => ({
          assertWhatsappReady: jest.fn(async () => undefined),
        }),
      },
    }));
  });

  test("listConversations 403 sin Ver conversaciones", async () => {
    const { res } = await callHandler(controller.listConversations, {
      req: createMockReq({ params: { eventId: "boda-ana" } }),
    });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "No tienes permiso para esta acción." }));
  });
});
