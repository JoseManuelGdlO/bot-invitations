import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks, fakeEvent, PERMS } from "../helpers/controller.js";
import { createInstance } from "../helpers/models.js";

describe("event-data.controller", () => {
  let controller;
  let models;
  const resetPlaygroundSessions = jest.fn(async () => 0);

  beforeEach(async () => {
    resetPlaygroundSessions.mockClear();
    ({ mod: controller, models } = await loadWithMocks("src/controllers/event-data.controller.js", {
      extraMocks: {
        "src/services/access.service.js": () => ({
          requireEvent: jest.fn(async () => fakeEvent()),
          requirePermission: jest.fn(async () => true),
          PERMS,
        }),
        "src/services/bot/session.service.js": () => ({
          resetPlaygroundSessions,
        }),
      },
    }));
  });

  test("getAi null si no hay config", async () => {
    models.AiConfig.findOne.mockResolvedValue(null);
    const { res } = await callHandler(controller.getAi, {
      req: createMockReq({ params: { eventId: "boda-ana" } }),
    });
    expect(res.json).toHaveBeenCalledWith(null);
  });

  test("updateAi 404", async () => {
    models.AiConfig.findOne.mockResolvedValue(null);
    const { res } = await callHandler(controller.updateAi, {
      req: createMockReq({ params: { eventId: "boda-ana" }, body: { tone: "Cálido" } }),
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("updateAi resetea playground si cambia la personalidad", async () => {
    const ai = createInstance({
      assistantName: "Sofía",
      tone: "Elegante",
      formality: 60,
      emojis: "algunos",
      length: "normales",
      openingMessage: "hola",
      prompt: "cerebro",
      rules: [],
      followUps: [],
    });
    models.AiConfig.findOne.mockResolvedValue(ai);
    await callHandler(controller.updateAi, {
      req: createMockReq({ params: { eventId: "boda-ana" }, body: { tone: "Casual" } }),
    });
    expect(ai.tone).toBe("Casual");
    expect(resetPlaygroundSessions).toHaveBeenCalledWith("evt_1");
  });

  test("updateAi no resetea playground si solo cambia openingMessage", async () => {
    const ai = createInstance({
      assistantName: "Sofía",
      tone: "Elegante",
      formality: 60,
      emojis: "algunos",
      length: "normales",
      openingMessage: "hola",
      prompt: "cerebro",
      rules: [],
      followUps: [],
    });
    models.AiConfig.findOne.mockResolvedValue(ai);
    await callHandler(controller.updateAi, {
      req: createMockReq({ body: { openingMessage: "otro" } }),
    });
    expect(ai.openingMessage).toBe("otro");
    expect(resetPlaygroundSessions).not.toHaveBeenCalled();
  });

  test("updateAi 400 si followUps no es arreglo", async () => {
    const ai = createInstance({
      assistantName: "Sofía",
      tone: "Elegante",
      formality: 60,
      emojis: "algunos",
      length: "normales",
      openingMessage: "hola",
      prompt: "cerebro",
      rules: [],
      followUps: [],
    });
    models.AiConfig.findOne.mockResolvedValue(ai);
    const { res } = await callHandler(controller.updateAi, {
      req: createMockReq({ body: { followUps: "nope" } }),
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("updateAi normaliza días de followUps", async () => {
    const ai = createInstance({
      assistantName: "Sofía",
      tone: "Elegante",
      formality: 60,
      emojis: "algunos",
      length: "normales",
      openingMessage: "hola",
      prompt: "cerebro",
      rules: [],
      followUps: [],
    });
    models.AiConfig.findOne.mockResolvedValue(ai);
    await callHandler(controller.updateAi, {
      req: createMockReq({
        body: {
          followUps: [{ id: "f2", label: "Primer recordatorio", days: 999, when: "texto viejo", active: true }],
        },
      }),
    });
    expect(ai.followUps).toEqual([
      expect.objectContaining({
        id: "f2",
        days: 180,
        when: "180 días después del primer contacto",
        active: true,
      }),
    ]);
  });

  test("setTemplates 400 si no es arreglo", async () => {
    const { res } = await callHandler(controller.setTemplates, {
      req: createMockReq({ body: { templates: "nope" } }),
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("setFaqs crea registros", async () => {
    models.Faq.bulkCreate.mockResolvedValue([{ id: "f1", q: "¿Dónde?", a: "Hacienda" }]);
    const { res } = await callHandler(controller.setFaqs, {
      req: createMockReq({ body: [{ q: "¿Dónde?", a: "Hacienda" }] }),
    });
    expect(models.Faq.destroy).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ q: "¿Dónde?" })]);
  });
});
