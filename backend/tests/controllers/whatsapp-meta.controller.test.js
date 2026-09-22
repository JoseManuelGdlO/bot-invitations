import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks } from "../helpers/controller.js";

describe("whatsapp-meta.controller", () => {
  let controller;
  let models;
  let sendTextWithRetry;
  let sendTemplateWithRetry;
  let getMessageTemplate;
  let findWhatsappMetaStatusByOwner;
  let parseWhatsappMetaCredentials;
  let resolveActiveWhatsappMetaByOwner;
  let upsertWhatsappMetaCredentials;
  let waitForTestDelivery;
  let getOwnerPricingAnalytics;
  const envState = {
    nodeEnv: "development",
    meta: {
      templateLanguage: "es_MX",
    },
  };
  const ownerCreds = {
    accessToken: "user-token",
    phoneNumberId: "10987654321",
    wabaId: "waba_1",
  };

  beforeEach(async () => {
    envState.nodeEnv = "development";
    sendTextWithRetry = jest.fn(async () => ({ messages: [{ id: "wamid.text" }] }));
    sendTemplateWithRetry = jest.fn(async () => ({ messages: [{ id: "wamid.tpl" }] }));
    getMessageTemplate = jest.fn(async () => ({
      name: "constructor",
      language: "es_MX",
      status: "APPROVED",
      parameterFormat: "positional",
      header: null,
      body: {
        text: "¡Hola {{1}}! {{2}}",
        parameters: [{ key: "1" }, { key: "2" }],
      },
      footer: { text: "Gracias" },
    }));
    findWhatsappMetaStatusByOwner = jest.fn(async () => ({
      configured: true,
      wabaId: "waba_1",
      phoneNumberId: "10987654321",
      displayPhoneNumber: "5512345678",
    }));
    parseWhatsappMetaCredentials = jest.fn((body) => ({
      accessToken: String(body.accessToken || "").trim(),
      wabaId: String(body.wabaId || "").trim(),
      phoneNumberId: String(body.phoneNumberId || "").trim(),
      displayPhoneNumber: body.displayPhoneNumber || null,
    }));
    resolveActiveWhatsappMetaByOwner = jest.fn(async () => ({
      credentials: ownerCreds,
    }));
    upsertWhatsappMetaCredentials = jest.fn(async ({ wabaId, phoneNumberId, displayPhoneNumber }) => ({
      integration: {
        wabaId,
        phoneNumberId,
        displayPhoneNumber: displayPhoneNumber || null,
      },
    }));
    waitForTestDelivery = jest.fn(async () => null);
    getOwnerPricingAnalytics = jest.fn(async () => ({
      range: "30d",
      start: 1,
      end: 2,
      currency: "USD",
      costAvailable: true,
      kpis: {
        totalCost: 10,
        totalVolume: 100,
        avgCostPerMessage: 0.1,
        freeVolume: 20,
        paidVolume: 80,
      },
      series: [],
      byCategory: [],
      cached: false,
    }));

    ({ mod: controller, models } = await loadWithMocks("src/controllers/whatsapp-meta.controller.js", {
      extraMocks: {
        "src/config/env.js": () => ({ env: envState }),
        "src/services/meta.client.js": () => ({
          metaClient: {
            sendTextWithRetry,
            sendTemplateWithRetry,
            getMessageTemplate,
            uploadDocument: jest.fn(),
          },
          sanitizeMetaBodyParam: (value) =>
            String(value || "")
              .replace(/\r\n/g, "\n")
              .replace(/\r/g, "\n")
              .replace(/\t/g, " ")
              .replace(/ {2,}/g, " ")
              .trim()
              .slice(0, 1024),
          fillMetaTemplate: (text, values = []) =>
            String(text || "")
              .replace("{{1}}", values[0] ?? "")
              .replace("{{2}}", values[1] ?? ""),
        }),
        "src/services/whatsapp-meta.service.js": () => ({
          findWhatsappMetaStatusByOwner,
          parseWhatsappMetaCredentials,
          resolveActiveWhatsappMetaByOwner,
          upsertWhatsappMetaCredentials,
        }),
        "src/services/meta-pricing-analytics.service.js": () => ({
          getOwnerPricingAnalytics,
        }),
        "src/services/whatsapp-test-delivery.js": () => ({
          waitForTestDelivery,
        }),
      },
    }));
    models.WhatsappMessageTemplate.count.mockResolvedValue(1);
    models.WhatsappMessageTemplate.findOne.mockResolvedValue({ name: "alanna_pc_default_1" });
    models.EventWhatsappTemplate.findOne.mockResolvedValue({
      template: { name: "alanna_pc_campaign_2" },
    });
  });

  test("status usa la plantilla marcada para campaña del owner", async () => {
    const { res } = await callHandler(controller.getWhatsappMetaStatus, {
      req: createMockReq({
        protocol: "http",
        get: (name) => (name === "host" ? "localhost:4000" : ""),
      }),
    });
    expect(findWhatsappMetaStatusByOwner).toHaveBeenCalledWith("usr_test_1");
    expect(res.json).toHaveBeenCalledWith({
      provider: "meta-cloud",
      configured: true,
      wabaId: "waba_1",
      phoneNumberId: "10987654321",
      displayPhoneNumber: "5512345678",
      hasTemplate: true,
      templateName: "alanna_pc_campaign_2",
      templateDisplayName: null,
      templateLanguage: "es_MX",
      webhookUrl: "http://localhost:4000/api/webhooks/meta",
    });
    expect(models.WhatsappMessageTemplate.count).toHaveBeenCalledWith({
      where: { ownerUserId: "usr_test_1", wabaId: "waba_1" },
    });
    expect(models.EventWhatsappTemplate.findOne).toHaveBeenCalledWith({
      where: { isCampaign: true },
      include: [
        {
          model: models.Event,
          required: true,
          where: { ownerId: "usr_test_1" },
        },
        {
          model: models.WhatsappMessageTemplate,
          as: "template",
          required: true,
          where: { ownerUserId: "usr_test_1", wabaId: "waba_1", purpose: "invitation" },
        },
      ],
    });
    expect(models.WhatsappMessageTemplate.findOne).not.toHaveBeenCalled();
  });

  test("status conserva hasTemplate pero no elige una default si no hay campaña", async () => {
    models.EventWhatsappTemplate.findOne.mockResolvedValue(null);
    const { res } = await callHandler(controller.getWhatsappMetaStatus, {
      req: createMockReq(),
    });

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ hasTemplate: true, templateName: null }),
    );
    expect(models.WhatsappMessageTemplate.findOne).not.toHaveBeenCalled();
  });

  test("status no cuenta plantillas de un WABA anterior", async () => {
    findWhatsappMetaStatusByOwner.mockResolvedValue({
      configured: true,
      wabaId: "waba_new",
      phoneNumberId: "10987654321",
      displayPhoneNumber: "5512345678",
    });
    models.WhatsappMessageTemplate.count.mockImplementation(async ({ where } = {}) => (
      where?.wabaId === "waba_new" ? 0 : 4
    ));
    models.EventWhatsappTemplate.findOne.mockResolvedValue(null);
    const { res } = await callHandler(controller.getWhatsappMetaStatus, {
      req: createMockReq(),
    });
    expect(models.WhatsappMessageTemplate.count).toHaveBeenCalledWith({
      where: { ownerUserId: "usr_test_1", wabaId: "waba_new" },
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ hasTemplate: false, templateName: null }),
    );
  });

  test("status hasTemplate false si no hay WABA conectado", async () => {
    findWhatsappMetaStatusByOwner.mockResolvedValue({
      configured: false,
      wabaId: null,
      phoneNumberId: null,
      displayPhoneNumber: null,
    });
    models.WhatsappMessageTemplate.count.mockResolvedValue(4);
    models.EventWhatsappTemplate.findOne.mockResolvedValue({
      template: { name: "alanna_old_waba" },
    });
    const { res } = await callHandler(controller.getWhatsappMetaStatus, {
      req: createMockReq(),
    });
    expect(models.WhatsappMessageTemplate.count).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ hasTemplate: false, templateName: null }),
    );
  });

  test("pricing-analytics devuelve el DTO del service", async () => {
    const { res } = await callHandler(controller.getWhatsappPricingAnalytics, {
      req: createMockReq({ query: { range: "7d" } }),
    });
    expect(getOwnerPricingAnalytics).toHaveBeenCalledWith({
      ownerUserId: "usr_test_1",
      range: "7d",
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        range: "30d",
        costAvailable: true,
        kpis: expect.objectContaining({ totalCost: 10, totalVolume: 100 }),
      }),
    );
  });

  test("pricing-analytics propaga 400 si WhatsApp no está configurado", async () => {
    const err = Object.assign(new Error("WhatsApp (Meta) no está configurado."), { status: 400 });
    getOwnerPricingAnalytics.mockRejectedValue(err);
    const { next } = await callHandler(controller.getWhatsappPricingAnalytics, {
      req: createMockReq({ query: { range: "30d" } }),
    });
    expect(next).toHaveBeenCalledWith(err);
  });

  test("status informa que no hay plantilla cuando el owner no tiene filas", async () => {
    models.WhatsappMessageTemplate.count.mockResolvedValue(0);
    models.WhatsappMessageTemplate.findOne.mockResolvedValue(null);
    models.EventWhatsappTemplate.findOne.mockResolvedValue(null);
    const { res } = await callHandler(controller.getWhatsappMetaStatus, {
      req: createMockReq(),
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ hasTemplate: false, templateName: null }),
    );
  });

  test("status oculta webhookUrl en production", async () => {
    envState.nodeEnv = "production";
    const { res } = await callHandler(controller.getWhatsappMetaStatus, {
      req: createMockReq({
        protocol: "https",
        get: (name) => (name === "host" ? "api.alannaconfirmaciones.com.mx" : ""),
      }),
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        configured: true,
        webhookUrl: null,
      }),
    );
  });

  test("status configured=false si el owner no tiene integración", async () => {
    findWhatsappMetaStatusByOwner.mockResolvedValue({
      configured: false,
      wabaId: null,
      phoneNumberId: null,
      displayPhoneNumber: null,
    });
    const { res } = await callHandler(controller.getWhatsappMetaStatus, {
      req: createMockReq(),
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ configured: false }));
  });

  test("credentials upsert guarda el token del usuario", async () => {
    const { res } = await callHandler(controller.postWhatsappMetaCredentials, {
      req: createMockReq({
        body: {
          accessToken: "EAAG-token",
          wabaId: "waba_9",
          phoneNumberId: "222",
          displayPhoneNumber: "5511111111",
        },
      }),
    });
    expect(upsertWhatsappMetaCredentials).toHaveBeenCalledWith({
      ownerUserId: "usr_test_1",
      accessToken: "EAAG-token",
      wabaId: "waba_9",
      phoneNumberId: "222",
      displayPhoneNumber: "5511111111",
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        configured: true,
        wabaId: "waba_9",
        phoneNumberId: "222",
      }),
    );
  });

  test("send-test text llama sendTextWithRetry con credenciales del owner", async () => {
    const { res } = await callHandler(controller.postWhatsappMetaSendTest, {
      req: createMockReq({
        body: { to: "5512345678", type: "text", text: "Hola de prueba" },
      }),
    });
    expect(resolveActiveWhatsappMetaByOwner).toHaveBeenCalledWith("usr_test_1");
    expect(sendTextWithRetry).toHaveBeenCalledWith({
      to: "5512345678",
      text: "Hola de prueba",
      accessToken: "user-token",
      phoneNumberId: "10987654321",
    });
    expect(sendTemplateWithRetry).not.toHaveBeenCalled();
    expect(waitForTestDelivery).toHaveBeenCalledWith("wamid.text");
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ ok: true, type: "text", id: "wamid.text" });
  });

  test("send-test text 400 si el webhook reporta ventana de 24 h cerrada", async () => {
    waitForTestDelivery.mockResolvedValue({
      messageId: "wamid.text",
      status: "failed",
      errors: [
        {
          code: 131047,
          title: "Re-engagement message",
          message: "Re-engagement message",
          error_data: {
            details:
              "Message failed to send because more than 24 hours have passed since the customer last replied to this number.",
          },
        },
      ],
    });
    const { next, res } = await callHandler(controller.postWhatsappMetaSendTest, {
      req: createMockReq({
        body: { to: "5512345678", type: "text", text: "Hola de prueba" },
      }),
    });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      status: 400,
      message: "Han pasado más de 24 horas. Debes usar una plantilla aprobada.",
    }));
    expect(res.status).not.toHaveBeenCalled();
  });

  test("send-test template 400 sin plantilla de campaña del WABA activo", async () => {
    models.EventWhatsappTemplate.findOne.mockResolvedValue(null);
    const { next } = await callHandler(controller.postWhatsappMetaSendTest, {
      req: createMockReq({
        body: { to: "5512345678", type: "template", name: "Luis", text: "Invitación de boda" },
      }),
    });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      status: 400,
      message: "Crea una plantilla de primer contacto y espera la aprobación de Meta.",
    }));
    expect(sendTemplateWithRetry).not.toHaveBeenCalled();
  });

  test("send-test template 400 con dos defaults del WABA y sin pivot isCampaign", async () => {
    models.EventWhatsappTemplate.findOne.mockResolvedValue(null);
    models.WhatsappMessageTemplate.findOne.mockResolvedValue({
      id: "tpl_slot2",
      name: "alanna_default_2",
      status: "APPROVED",
      headerType: "none",
      isWabaDefault: true,
    });
    const { next } = await callHandler(controller.postWhatsappMetaSendTest, {
      req: createMockReq({
        body: { to: "5512345678", type: "template", name: "Luis", text: "Invitación de boda" },
      }),
    });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      status: 400,
      message: "Crea una plantilla de primer contacto y espera la aprobación de Meta.",
    }));
    expect(sendTemplateWithRetry).not.toHaveBeenCalled();
  });

  test("send-test template usa el name de campaña y valores de ejemplo de los slots", async () => {
    models.EventWhatsappTemplate.findOne.mockResolvedValue({
      isCampaign: true,
      eventId: "evt_1",
      Event: { id: "evt_1", ownerId: "usr_test_1" },
      slotMappings: {
        "1": { type: "field", key: "nombre" },
        "2": { type: "field", key: "numero_invitados" },
        "3": { type: "literal", value: "Boda Ana" },
      },
      template: {
        name: "alanna_pc_campaign_2",
        status: "APPROVED",
        headerType: "none",
        headerMediaPath: null,
        components: [
          {
            type: "BODY",
            text: "Hola {{1}}, reservamos {{2}} pases para {{3}}, por favor confirma.",
          },
        ],
      },
    });
    const { res } = await callHandler(controller.postWhatsappMetaSendTest, {
      req: createMockReq({
        body: { to: "5512345678", type: "template" },
      }),
    });
    expect(sendTemplateWithRetry).toHaveBeenCalledWith({
      to: "5512345678",
      bodyParams: ["María", "2", "Boda Ana"],
      templateName: "alanna_pc_campaign_2",
      accessToken: "user-token",
      phoneNumberId: "10987654321",
    });
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ ok: true, type: "template", id: "wamid.tpl" });
  });

  test("send-test 400 si type es inválido", async () => {
    const { next } = await callHandler(controller.postWhatsappMetaSendTest, {
      req: createMockReq({ body: { to: "5512345678", type: "image", text: "x" } }),
    });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(sendTextWithRetry).not.toHaveBeenCalled();
  });

  test("send-test template no exige text del request", async () => {
    models.EventWhatsappTemplate.findOne.mockResolvedValue({
      isCampaign: true,
      eventId: "evt_1",
      Event: { id: "evt_1", ownerId: "usr_test_1" },
      slotMappings: {
        "1": { type: "field", key: "nombre" },
        "2": { type: "field", key: "numero_invitados" },
      },
      template: {
        name: "alanna_pc_campaign_2",
        status: "APPROVED",
        headerType: "none",
        headerMediaPath: null,
        components: [{ type: "BODY", text: "Hola {{1}}, hay {{2}} pases reservados para ti." }],
      },
    });
    const { res } = await callHandler(controller.postWhatsappMetaSendTest, {
      req: createMockReq({ body: { to: "5512345678", type: "template" } }),
    });
    expect(sendTemplateWithRetry).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(202);
  });

  test("GET template usa credenciales del owner y templateName del query", async () => {
    const { res } = await callHandler(controller.getWhatsappMetaTemplate, {
      req: createMockReq({ query: { templateName: "alanna_pc_campaign_2" } }),
    });
    expect(resolveActiveWhatsappMetaByOwner).toHaveBeenCalledWith("usr_test_1");
    expect(getMessageTemplate).toHaveBeenCalledWith({
      accessToken: "user-token",
      wabaId: "waba_1",
      templateName: "alanna_pc_campaign_2",
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "constructor",
        footer: { text: "Gracias" },
      }),
    );
  });

  test("GET template acepta templateName en el body", async () => {
    await callHandler(controller.getWhatsappMetaTemplate, {
      req: createMockReq({ query: {}, body: { templateName: "alanna_pc_doc" } }),
    });
    expect(getMessageTemplate).toHaveBeenCalledWith({
      accessToken: "user-token",
      wabaId: "waba_1",
      templateName: "alanna_pc_doc",
    });
  });

  test("GET template 400 si falta templateName", async () => {
    const { next } = await callHandler(controller.getWhatsappMetaTemplate, {
      req: createMockReq({ query: {} }),
    });
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 400,
        message: "Falta el nombre de la plantilla de WhatsApp.",
      }),
    );
    expect(resolveActiveWhatsappMetaByOwner).not.toHaveBeenCalled();
    expect(getMessageTemplate).not.toHaveBeenCalled();
  });

  test("GET template 400 si WhatsApp no está configurado", async () => {
    resolveActiveWhatsappMetaByOwner.mockRejectedValue(
      Object.assign(new Error("WhatsApp (Meta) no está configurado."), { status: 400 }),
    );
    const { next } = await callHandler(controller.getWhatsappMetaTemplate, {
      req: createMockReq({ query: { templateName: "alanna_pc_campaign_2" } }),
    });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(getMessageTemplate).not.toHaveBeenCalled();
  });
});
