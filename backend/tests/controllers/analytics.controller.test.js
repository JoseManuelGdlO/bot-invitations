import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks, fakeEvent } from "../helpers/controller.js";

describe("analytics.controller", () => {
  let controller;
  let models;

  beforeEach(async () => {
    ({ mod: controller, models } = await loadWithMocks("src/controllers/analytics.controller.js", {
      extraMocks: {
        "src/services/access.service.js": () => ({
          requireEvent: jest.fn(async () => fakeEvent()),
          userEventIds: jest.fn(async () => ["evt_1"]),
        }),
        "src/services/state.service.js": () => ({
          buildAnalytics: jest.fn(() => ({ dailyConfirmations: [], timeline: [] })),
        }),
      },
    }));
  });

  test("getAnalytics", async () => {
    models.Guest.findAll.mockResolvedValue([]);
    models.Conversation.findAll.mockResolvedValue([]);
    const { res } = await callHandler(controller.getAnalytics, {
      req: createMockReq({ params: { eventId: "boda-ana" } }),
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ timeline: [] }));
  });

  test("listActivity global", async () => {
    models.Activity.findAll.mockResolvedValue([]);
    models.Event.findAll.mockResolvedValue([fakeEvent()]);
    const { res } = await callHandler(controller.listActivity, { req: createMockReq({ params: {} }) });
    expect(res.json).toHaveBeenCalledWith([]);
  });
});
