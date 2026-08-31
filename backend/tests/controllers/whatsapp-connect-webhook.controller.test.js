import crypto from "node:crypto";
import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks } from "../helpers/controller.js";

function signBody(secret, timestamp, rawBody) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

describe("whatsapp-connect-webhook.controller", () => {
  let controller;
  let resolveWhatsappConnectIntegrationByDevice;
  let handleInboundWhatsapp;

  const credentials = { deviceId: "dev_1", webhookSecret: "hook-secret" };
  const integration = { id: "int_1", ownerUserId: "usr_test_1" };

  beforeEach(async () => {
    resolveWhatsappConnectIntegrationByDevice = jest.fn(async () => ({ integration, credentials }));
    handleInboundWhatsapp = jest.fn(async () => ({ processed: true, reason: "ai_reply" }));

    ({ mod: controller } = await loadWithMocks("src/controllers/whatsapp-connect-webhook.controller.js", {
      extraMocks: {
        "src/services/integration-resolver.service.js": () => ({
          resolveWhatsappConnectIntegrationByDevice,
        }),
        "src/controllers/bot.controller.js": () => ({
          postWhatsappConnectEvents: jest.fn(),
          handleInboundWhatsapp,
        }),
      },
    }));
  });

  test("lookup 400 sin deviceId", async () => {
    const { next } = await callHandler(controller.resolveWhatsappWebhookIntegration, {
      req: createMockReq({ body: { type: "message.inbound" }, rawBody: "{}" }),
    });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(resolveWhatsappConnectIntegrationByDevice).not.toHaveBeenCalled();
  });

  test("lookup 400 si el JSON es inválido", async () => {
    const { next } = await callHandler(controller.resolveWhatsappWebhookIntegration, {
      req: createMockReq({ body: Buffer.from("{nope"), rawBody: "{nope" }),
    });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, message: "JSON de webhook inválido." }));
  });

  test("lookup 404 si no hay integración para el device", async () => {
    const err = Object.assign(new Error("No hay una integración whatsapp-connect activa para este device."), {
      status: 404,
    });
    resolveWhatsappConnectIntegrationByDevice.mockRejectedValueOnce(err);
    const payload = { deviceId: "dev_unknown", type: "message.inbound" };
    const { next } = await callHandler(controller.resolveWhatsappWebhookIntegration, {
      req: createMockReq({ body: payload, rawBody: JSON.stringify(payload) }),
    });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
  });

  test("lookup resuelve la integración por deviceId", async () => {
    const payload = { deviceId: "dev_1", type: "message.inbound" };
    const { req, next } = await callHandler(controller.resolveWhatsappWebhookIntegration, {
      req: createMockReq({ body: payload, rawBody: JSON.stringify(payload) }),
    });
    expect(next).toHaveBeenCalledWith();
    expect(resolveWhatsappConnectIntegrationByDevice).toHaveBeenCalledWith({ deviceId: "dev_1" });
    expect(req.wc.integration).toEqual(integration);
    expect(req.wc.credentials).toEqual(credentials);
  });

  test("firma 401 si faltan cabeceras", async () => {
    const { next } = await callHandler(controller.verifyWcSignature, {
      req: createMockReq({
        headers: {},
        rawBody: "{}",
        wc: { credentials },
      }),
    });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  test("firma 401 si el HMAC no coincide", async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const { next } = await callHandler(controller.verifyWcSignature, {
      req: createMockReq({
        headers: { "x-wc-signature": "aa".repeat(32), "x-wc-timestamp": timestamp },
        rawBody: "{}",
        wc: { credentials },
      }),
    });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401, message: "Firma de webhook inválida." }));
  });

  test("firma válida marca signatureVerified", async () => {
    const rawBody = JSON.stringify({ deviceId: "dev_1" });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signBody(credentials.webhookSecret, timestamp, rawBody);
    const { req, next } = await callHandler(controller.verifyWcSignature, {
      req: createMockReq({
        headers: { "x-wc-signature": signature, "x-wc-timestamp": timestamp },
        rawBody,
        wc: { credentials },
      }),
    });
    expect(next).toHaveBeenCalledWith();
    expect(req.wc.signatureVerified).toBe(true);
    expect(req.wc.requestTimestampMs).toBe(Number(timestamp) * 1000);
  });

  test("anti-replay 401 si el timestamp está fuera de ventana", async () => {
    const { next } = await callHandler(controller.antiReplayWindow, {
      req: createMockReq({
        wc: { requestTimestampMs: Date.now() - 10 * 60 * 1000 },
      }),
    });
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401, message: "El timestamp del webhook está fuera de la ventana permitida." }),
    );
  });

  test("anti-replay deja pasar un timestamp fresco", async () => {
    const { next } = await callHandler(controller.antiReplayWindow, {
      req: createMockReq({ wc: { requestTimestampMs: Date.now() } }),
    });
    expect(next).toHaveBeenCalledWith();
  });

  test("challenge de Meta responde hub.challenge en texto plano", async () => {
    const { res, next } = await callHandler(controller.verifyMetaWebhook, {
      req: createMockReq({
        query: {
          "hub.mode": "subscribe",
          "hub.challenge": "1158201444",
          "hub.verify_token": "test-meta-verify-token",
        },
      }),
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/plain; charset=utf-8");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith("1158201444");
  });

  test("challenge de Meta acepta query anidada hub.mode", async () => {
    const { res } = await callHandler(controller.verifyMetaWebhook, {
      req: createMockReq({
        query: {
          hub: { mode: "subscribe", challenge: "99", verify_token: "test-meta-verify-token" },
        },
      }),
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith("99");
  });

  test("challenge 403 si el verify token no coincide", async () => {
    const { res } = await callHandler(controller.verifyMetaWebhook, {
      req: createMockReq({
        query: {
          "hub.mode": "subscribe",
          "hub.challenge": "1158201444",
          "hub.verify_token": "otro-token",
        },
      }),
    });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).not.toHaveBeenCalled();
  });

  test("challenge 403 si falta hub.mode=subscribe", async () => {
    const { res } = await callHandler(controller.verifyMetaWebhook, {
      req: createMockReq({
        query: {
          "hub.challenge": "1158201444",
          "hub.verify_token": "test-meta-verify-token",
        },
      }),
    });
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
