import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks, fakeEvent, PERMS } from "../helpers/controller.js";
import { createInstance } from "../helpers/models.js";

describe("conversations.controller", () => {
  let controller;
  let models;
  let planCampaign;
  let getEventCampaignSnapshot;

  beforeEach(async () => {
    planCampaign = jest.fn(async () => ({
      status: "scheduled",
      scheduledAt: "2026-08-28",
      launchedAt: null,
      total: 0,
      processed: 0,
      percent: 0,
    }));
    getEventCampaignSnapshot = jest.fn(async () => ({
      status: "idle",
      scheduledAt: null,
      launchedAt: null,
      total: 0,
      processed: 0,
      percent: 0,
    }));
    ({ mod: controller, models } = await loadWithMocks("src/controllers/conversations.controller.js", {
      extraMocks: {
        "src/services/access.service.js": () => ({
          requireEvent: jest.fn(async () => fakeEvent()),
          userEventIds: jest.fn(async () => ["evt_1"]),
          requirePermission: jest.fn(async () => true),
          PERMS,
        }),
        "src/services/outbound.worker.js": () => ({ enqueueJob: jest.fn(async () => undefined) }),
        "src/services/plans.service.js": () => ({ assertCanSendInvitations: jest.fn() }),
        "src/services/campaign.service.js": () => ({ planCampaign, getEventCampaignSnapshot }),
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

  test("launchCampaign planifica now", async () => {
    const { res } = await callHandler(controller.launchCampaign, {
      req: createMockReq({ params: { eventId: "boda-ana" }, body: { mode: "now" } }),
    });
    expect(planCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ id: "evt_1" }),
      { mode: "now" },
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: "scheduled" }));
  });

  test("launchCampaign 409 si ya está en curso", async () => {
    const err = Object.assign(new Error("La campaña ya está en curso."), { status: 409 });
    err.campaign = { status: "running", total: 4, processed: 1, percent: 25, scheduledAt: null, launchedAt: null };
    planCampaign.mockRejectedValue(err);
    const { res } = await callHandler(controller.launchCampaign, {
      req: createMockReq({ params: { eventId: "boda-ana" }, body: { mode: "now" } }),
    });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ campaign: expect.objectContaining({ status: "running" }) }),
    );
  });

  test("getCurrentCampaign devuelve snapshot", async () => {
    getEventCampaignSnapshot.mockResolvedValue({
      status: "running",
      scheduledAt: "2026-08-28",
      launchedAt: null,
      total: 10,
      processed: 4,
      percent: 40,
    });
    const { res } = await callHandler(controller.getCurrentCampaign, {
      req: createMockReq({ params: { eventId: "boda-ana" } }),
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: "running", percent: 40 }));
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
