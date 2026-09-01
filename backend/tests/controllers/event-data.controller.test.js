import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks, fakeEvent, PERMS } from "../helpers/controller.js";
import { createInstance } from "../helpers/models.js";

function sampleAi(overrides = {}) {
  return createInstance({
    assistantName: "Sofía",
    tone: "Elegante",
    formality: 60,
    emojis: "algunos",
    length: "normales",
    openingMessage: "hola",
    prompt: "cerebro",
    rules: [],
    followUps: [],
    ...overrides,
  });
}

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

  function stubAi(ai, created = false) {
    models.AiConfig.findOrCreate.mockResolvedValue([ai, created]);
  }

  test("getAi null si no hay config", async () => {
    models.AiConfig.findOne.mockResolvedValue(null);
    const { res } = await callHandler(controller.getAi, {
      req: createMockReq({ params: { eventId: "boda-ana" } }),
    });
    expect(res.json).toHaveBeenCalledWith(null);
  });

  test("updateAi crea config si no existe", async () => {
    const { res } = await callHandler(controller.updateAi, {
      req: createMockReq({ params: { eventId: "boda-ana" }, body: { tone: "Cálido" } }),
    });
    expect(models.AiConfig.findOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: "evt_1" } }),
    );
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ tone: "Cálido" }));
  });

  test("updateAi resetea playground si cambia la personalidad", async () => {
    const ai = sampleAi();
    stubAi(ai);
    await callHandler(controller.updateAi, {
      req: createMockReq({ params: { eventId: "boda-ana" }, body: { tone: "Casual" } }),
    });
    expect(ai.tone).toBe("Casual");
    expect(resetPlaygroundSessions).toHaveBeenCalledWith("evt_1");
  });

  test("updateAi no resetea playground si solo cambia openingMessage", async () => {
    const ai = sampleAi();
    stubAi(ai);
    await callHandler(controller.updateAi, {
      req: createMockReq({ body: { openingMessage: "otro" } }),
    });
    expect(ai.openingMessage).toBe("otro");
    expect(resetPlaygroundSessions).not.toHaveBeenCalled();
  });

  test("updateAi 400 si followUps no es arreglo", async () => {
    stubAi(sampleAi());
    const { res } = await callHandler(controller.updateAi, {
      req: createMockReq({ body: { followUps: "nope" } }),
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("updateAi normaliza días de followUps", async () => {
    const ai = sampleAi();
    stubAi(ai);
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

  test("getAiDefaults devuelve reglas con flag technical", async () => {
    const { res } = await callHandler(controller.getAiDefaults, {
      req: createMockReq({ params: { eventId: "boda-ana" } }),
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: "Elegante",
        prompt: "",
        rules: expect.arrayContaining([
          expect.objectContaining({
            text: "Nunca mencionar que eres una IA.",
            technical: false,
          }),
          expect.objectContaining({
            text: "Clasifica cada mensaje en faq, asistira, no_asistira, seguimiento o desconocido.",
            technical: true,
          }),
        ]),
      }),
    );
  });

  test("resetAi restaura tono, reglas y prompt", async () => {
    const ai = sampleAi({
      tone: "Casual",
      formality: 20,
      emojis: "frecuentes",
      length: "cortos",
      prompt: "instrucciones custom",
      rules: ["regla custom"],
      followUps: [{ id: "f1", label: "Primer contacto", days: 30, when: "30 días antes del evento", active: true }],
    });
    stubAi(ai);
    await callHandler(controller.resetAi, {
      req: createMockReq({ params: { eventId: "boda-ana" } }),
    });
    expect(ai.tone).toBe("Elegante");
    expect(ai.formality).toBe(60);
    expect(ai.emojis).toBe("algunos");
    expect(ai.length).toBe("normales");
    expect(ai.prompt).toBe("");
    expect(ai.assistantName).toBe("Sofía");
    expect(ai.rules).toEqual(
      expect.arrayContaining([
        "Nunca mencionar que eres una IA.",
        "Clasifica cada mensaje en faq, asistira, no_asistira, seguimiento o desconocido.",
      ]),
    );
    expect(resetPlaygroundSessions).toHaveBeenCalledWith("evt_1");
  });

  test("resetAi crea config si no existe", async () => {
    const { res } = await callHandler(controller.resetAi, {
      req: createMockReq({ params: { eventId: "boda-ana" } }),
    });
    expect(models.AiConfig.findOrCreate).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ tone: "Elegante" }));
  });

  test("regeneratePrompt crea config si no existe", async () => {
    const { res } = await callHandler(controller.regeneratePrompt, {
      req: createMockReq({ params: { eventId: "boda-ana" } }),
    });
    expect(models.AiConfig.findOrCreate).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalled();
  });

  test("updateAi reinyecta reglas técnicas si el cliente las omite", async () => {
    const ai = sampleAi({ prompt: "", rules: [] });
    stubAi(ai);
    await callHandler(controller.updateAi, {
      req: createMockReq({
        body: { rules: ["Nunca mencionar que eres una IA.", "Hablar de valet"] },
      }),
    });
    expect(ai.rules).toEqual(
      expect.arrayContaining([
        "Nunca mencionar que eres una IA.",
        "El primer mensaje ya se envió; no reenvíes la invitación.",
        "Hablar de valet",
      ]),
    );
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
