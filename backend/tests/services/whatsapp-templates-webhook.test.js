import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks } from "../helpers/controller.js";

const graphClientMock = () => ({
  resolveTemplateCrudToken: () => "t",
  createMessageTemplate: jest.fn(),
  updateMessageTemplate: jest.fn(),
  uploadResumableHeader: jest.fn(),
});

function templateStatusPayload(overrides = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "waba_1",
      changes: [{
        field: "message_template_status_update",
        value: {
          event: "REJECTED",
          message_template_id: "111",
          message_template_name: "alanna_pc_ab_1",
          message_template_language: "es_MX",
          reason: "INVALID_FORMAT",
          ...overrides,
        },
      }],
    }],
  };
}

describe("webhook de estado de plantillas WhatsApp", () => {
  test("extrae el update desde entry.id sin exigir phone_number_id", async () => {
    const { mod } = await loadWithMocks("src/controllers/meta-webhook.controller.js");

    expect(mod.extractTemplateStatusUpdates(templateStatusPayload())).toEqual([{
      wabaId: "waba_1",
      metaTemplateId: "111",
      name: "alanna_pc_ab_1",
      language: "es_MX",
      event: "REJECTED",
      reason: "INVALID_FORMAT",
    }]);
  });

  test.each([
    ["APPROVED", "APPROVED"],
    ["REJECTED", "REJECTED"],
    ["FLAGGED", "PAUSED"],
    ["PAUSED", "PAUSED"],
    ["DISABLED", "DISABLED"],
    ["UNKNOWN", null],
  ])("mapea el evento %s a %s", async (event, expected) => {
    const { mod } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
      extraMocks: { "src/services/meta-graph.client.js": graphClientMock },
    });

    expect(mod.mapTemplateStatusEvent(event)).toBe(expected);
  });

  test("APPROVED actualiza status por metaTemplateId", async () => {
    const row = {
      id: "tpl_1",
      status: "PENDING",
      update: jest.fn(async function update(patch) {
        Object.assign(this, patch);
        return this;
      }),
    };
    const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
      extraMocks: { "src/services/meta-graph.client.js": graphClientMock },
    });
    models.WhatsappMessageTemplate.findOne.mockResolvedValue(row);

    const result = await mod.applyTemplateStatusUpdate({
      wabaId: "waba_1",
      metaTemplateId: "111",
      name: "alanna_pc_ab_1",
      event: "APPROVED",
      reason: null,
    });

    expect(models.WhatsappMessageTemplate.findOne).toHaveBeenCalledWith({
      where: { metaTemplateId: "111" },
    });
    expect(row.status).toBe("APPROVED");
    expect(row.rejectedReason).toBeNull();
    expect(row.lastStatusAt).toBeInstanceOf(Date);
    expect(result).toMatchObject({ processed: true });
  });

  test("REJECTED conserva la razón y busca por WABA/nombre sin ID", async () => {
    const row = {
      id: "tpl_1",
      update: jest.fn(async function update(patch) {
        Object.assign(this, patch);
        return this;
      }),
    };
    const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
      extraMocks: { "src/services/meta-graph.client.js": graphClientMock },
    });
    models.WhatsappMessageTemplate.findOne.mockResolvedValue(row);

    await mod.applyTemplateStatusUpdate({
      wabaId: "waba_1",
      metaTemplateId: null,
      name: "alanna_pc_ab_1",
      event: "REJECTED",
      reason: "INVALID_FORMAT",
    });

    expect(models.WhatsappMessageTemplate.findOne).toHaveBeenCalledWith({
      where: { wabaId: "waba_1", name: "alanna_pc_ab_1" },
    });
    expect(row.rejectedReason).toBe("INVALID_FORMAT");
  });

  test("plantilla desconocida registra log y produce 200 lógico", async () => {
    const loggerSpies = {
      info: jest.fn(),
      warn: jest.fn(),
    };
    const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
      extraMocks: {
        "src/services/meta-graph.client.js": graphClientMock,
        "src/utils/logger.js": () => ({
          Logger: jest.fn().mockImplementation(() => ({
            info: loggerSpies.info,
            warn: loggerSpies.warn,
            error: jest.fn(),
            debug: jest.fn(),
          })),
        }),
      },
    });
    models.WhatsappMessageTemplate.findOne.mockResolvedValue(null);

    await expect(mod.applyTemplateStatusUpdate({
      wabaId: "waba_x",
      metaTemplateId: "999",
      name: "nope",
      event: "REJECTED",
      reason: "invalid",
    })).resolves.toEqual({ processed: true, reason: "unknown_template" });

    expect(loggerSpies.warn).toHaveBeenCalledWith(
      "plantilla desconocida en webhook de estado",
      {
        wabaId: "waba_x",
        metaTemplateId: "999",
        name: "nope",
      },
    );
    expect(loggerSpies.info).not.toHaveBeenCalled();
  });

  test("ignora eventos desconocidos sin consultar la plantilla", async () => {
    const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
      extraMocks: { "src/services/meta-graph.client.js": graphClientMock },
    });

    await expect(mod.applyTemplateStatusUpdate({
      wabaId: "waba_1",
      metaTemplateId: "111",
      name: "alanna_pc_ab_1",
      event: "UNKNOWN",
    })).resolves.toMatchObject({ processed: true, reason: "unknown_event" });
    expect(models.WhatsappMessageTemplate.findOne).not.toHaveBeenCalled();
  });

  test("postMetaEvents aplica template updates antes del loop de messages", async () => {
    const order = [];
    const applyTemplateStatusUpdate = jest.fn(async () => {
      order.push("template");
      return { processed: true, reason: "template_updated" };
    });
    const resolveActiveWhatsappMetaByPhoneNumberId = jest.fn(async () => {
      order.push("message");
      return null;
    });
    const { mod } = await loadWithMocks("src/controllers/meta-webhook.controller.js", {
      extraMocks: {
        "src/controllers/bot.controller.js": () => ({ handleInboundWhatsapp: jest.fn() }),
        "src/services/whatsapp-meta.service.js": () => ({
          resolveActiveWhatsappMetaByPhoneNumberId,
        }),
        "src/services/whatsapp-status.service.js": () => ({
          applyWhatsappDeliveryStatus: jest.fn(),
        }),
        "src/services/whatsapp-templates.service.js": () => ({
          applyTemplateStatusUpdate,
        }),
      },
    });
    const payload = templateStatusPayload();
    payload.entry[0].changes.push({
      value: {
        metadata: { phone_number_id: "phone_1" },
        messages: [{ from: "5216181556489", id: "wamid.1", type: "text", text: { body: "hola" } }],
      },
    });

    const { res } = await callHandler(mod.postMetaEvents, {
      req: createMockReq({ body: payload, rawBody: JSON.stringify(payload) }),
    });

    expect(order).toEqual(["template", "message"]);
    expect(applyTemplateStatusUpdate).toHaveBeenCalledWith(expect.objectContaining({
      wabaId: "waba_1",
      metaTemplateId: "111",
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      processed: 2,
      results: [
        expect.objectContaining({ reason: "template_updated" }),
        expect.objectContaining({ reason: "integration_not_found" }),
      ],
    }));
  });
});
