import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks } from "../helpers/controller.js";

describe("whatsapp-meta.controller", () => {
  let controller;
  let sendTextWithRetry;
  let sendTemplateWithRetry;
  let findWhatsappMetaStatusByOwner;
  let parseWhatsappMetaCredentials;
  let resolveActiveWhatsappMetaByOwner;
  let upsertWhatsappMetaCredentials;
  const envState = {
    nodeEnv: "development",
    meta: {
      templateName: "constructor",
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
    envState.meta.templateName = "constructor";
    sendTextWithRetry = jest.fn(async () => ({ messages: [{ id: "wamid.text" }] }));
    sendTemplateWithRetry = jest.fn(async () => ({ messages: [{ id: "wamid.tpl" }] }));
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

    ({ mod: controller } = await loadWithMocks("src/controllers/whatsapp-meta.controller.js", {
      extraMocks: {
        "src/config/env.js": () => ({ env: envState }),
        "src/services/meta.client.js": () => ({
          metaClient: { sendTextWithRetry, sendTemplateWithRetry },
          sanitizeMetaBodyParam: (value) =>
            String(value || "")
              .replace(/\r\n/g, "\n")
              .replace(/\r/g, "\n")
              .replace(/\t/g, " ")
              .replace(/ {2,}/g, " ")
              .trim()
              .slice(0, 1024),
        }),
        "src/services/whatsapp-meta.service.js": () => ({
          findWhatsappMetaStatusByOwner,
          parseWhatsappMetaCredentials,
          resolveActiveWhatsappMetaByOwner,
          upsertWhatsappMetaCredentials,
        }),
      },
    }));
  });

  test("status incluye webhookUrl en development y datos del owner", async () => {
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
      templateName: "constructor",
      templateLanguage: "es_MX",
      webhookUrl: "http://localhost:4000/api/webhooks/meta",
    });
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
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ ok: true, type: "text", id: "wamid.text" });
  });

  test("send-test template usa {{1}} nombre y {{2}} texto", async () => {
    const { res } = await callHandler(controller.postWhatsappMetaSendTest, {
      req: createMockReq({
        body: { to: "5512345678", type: "template", name: "Luis", text: "Invitación de boda" },
      }),
    });
    expect(sendTemplateWithRetry).toHaveBeenCalledWith({
      to: "5512345678",
      bodyParams: ["Luis", "Invitación de boda"],
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

  test("send-test 400 si el texto de plantilla está vacío", async () => {
    const { next } = await callHandler(controller.postWhatsappMetaSendTest, {
      req: createMockReq({ body: { to: "5512345678", type: "template", text: "  " } }),
    });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(sendTemplateWithRetry).not.toHaveBeenCalled();
  });
});
