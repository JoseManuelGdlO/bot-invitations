import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks } from "../helpers/controller.js";

describe("whatsapp-meta.controller", () => {
  let controller;
  let sendTextWithRetry;
  let sendTemplateWithRetry;
  const envState = {
    nodeEnv: "development",
    meta: {
      accessToken: "tok",
      phoneNumberId: "1284363278094218",
      templateName: "constructor",
      templateLanguage: "es_MX",
    },
  };

  beforeEach(async () => {
    envState.nodeEnv = "development";
    envState.meta.accessToken = "tok";
    envState.meta.phoneNumberId = "1284363278094218";
    envState.meta.templateName = "constructor";
    sendTextWithRetry = jest.fn(async () => ({ messages: [{ id: "wamid.text" }] }));
    sendTemplateWithRetry = jest.fn(async () => ({ messages: [{ id: "wamid.tpl" }] }));

    ({ mod: controller } = await loadWithMocks("src/controllers/whatsapp-meta.controller.js", {
      extraMocks: {
        "src/config/env.js": () => ({ env: envState }),
        "src/services/meta.client.js": () => ({
          metaClient: { sendTextWithRetry, sendTemplateWithRetry },
          sanitizeMetaBodyParam: (value) =>
            String(value || "")
              .replace(/[\r\n\t]+/g, " ")
              .replace(/ {2,}/g, " ")
              .trim()
              .slice(0, 1024),
        }),
      },
    }));
  });

  test("status incluye webhookUrl en development", async () => {
    const { res } = await callHandler(controller.getWhatsappMetaStatus, {
      req: createMockReq({
        protocol: "http",
        get: (name) => (name === "host" ? "localhost:4000" : ""),
      }),
    });
    expect(res.json).toHaveBeenCalledWith({
      provider: "meta-cloud",
      configured: true,
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

  test("status configured=false si falta token", async () => {
    envState.meta.accessToken = "";
    const { res } = await callHandler(controller.getWhatsappMetaStatus, {
      req: createMockReq(),
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ configured: false }));
  });

  test("send-test text llama sendTextWithRetry", async () => {
    const { res } = await callHandler(controller.postWhatsappMetaSendTest, {
      req: createMockReq({
        body: { to: "5512345678", type: "text", text: "Hola de prueba" },
      }),
    });
    expect(sendTextWithRetry).toHaveBeenCalledWith({ to: "5512345678", text: "Hola de prueba" });
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
