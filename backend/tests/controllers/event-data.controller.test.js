import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks, fakeEvent } from "../helpers/controller.js";
import { createInstance } from "../helpers/models.js";

describe("event-data.controller", () => {
  let controller;
  let models;

  beforeEach(async () => {
    ({ mod: controller, models } = await loadWithMocks("src/controllers/event-data.controller.js", {
      extraMocks: {
        "src/services/access.service.js": () => ({ requireEvent: jest.fn(async () => fakeEvent()) }),
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
