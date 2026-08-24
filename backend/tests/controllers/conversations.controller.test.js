import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks, fakeEvent, fakeGuest } from "../helpers/controller.js";
import { createInstance } from "../helpers/models.js";

describe("conversations.controller", () => {
  let controller;
  let models;

  beforeEach(async () => {
    ({ mod: controller, models } = await loadWithMocks("src/controllers/conversations.controller.js", {
      extraMocks: {
        "src/services/access.service.js": () => ({
          requireEvent: jest.fn(async () => fakeEvent()),
          userEventIds: jest.fn(async () => ["evt_1"]),
        }),
        "src/services/outbound.worker.js": () => ({ enqueueJob: jest.fn(async () => undefined) }),
        "src/services/activity.service.js": () => ({ logActivity: jest.fn(async () => undefined) }),
        "src/services/plans.service.js": () => ({ assertCanSendInvitations: jest.fn() }),
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
});
