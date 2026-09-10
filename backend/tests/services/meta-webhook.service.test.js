import crypto from "node:crypto";
import { jest } from "@jest/globals";
import { loadWithMocks } from "../helpers/loadWithMocks.js";

function sign(secret, raw) {
  return `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
}

describe("meta-webhook.service", () => {
  let service;
  let handleInboundWhatsapp;
  let resolveMetaWhatsappByPhoneNumberId;
  let resolveGuestForInbound;
  let claimInboundEvent;

  beforeEach(async () => {
    handleInboundWhatsapp = jest.fn(async () => ({ processed: true, reason: "ai_reply" }));
    resolveMetaWhatsappByPhoneNumberId = jest.fn(async () => ({
      integration: { id: "int_meta", ownerUserId: "usr_test_1", wabaId: "waba_1" },
      credentials: { phoneNumberId: "phone_1" },
    }));
    resolveGuestForInbound = jest.fn(async () => ({
      guest: { id: "gst_1", whatsapp: "enviado", save: jest.fn() },
      event: { id: "evt_1" },
    }));
    claimInboundEvent = jest.fn(async () => ({ duplicate: false }));

    ({ mod: service } = await loadWithMocks("src/services/meta-webhook.service.js", {
      extraMocks: {
        "src/controllers/bot.controller.js": () => ({ handleInboundWhatsapp }),
        "src/services/bot/bot.service.js": () => ({ resolveGuestForInbound }),
        "src/services/inbound-dedupe.service.js": () => ({
          claimInboundEvent,
          inboundDedupeKey: ({ messageId }) => `msg:${messageId}`,
        }),
        "src/services/integration-resolver.service.js": () => ({
          resolveMetaWhatsappByPhoneNumberId,
        }),
      },
    }));
  });

  test("verifyMetaSignature acepta HMAC oficial", () => {
    const raw = '{"ok":true}';
    const header = sign("test-meta-app-secret", raw);
    expect(service.verifyMetaSignature(raw, header, "test-meta-app-secret")).toEqual({ ok: true });
  });

  test("verifyMetaSignature rechaza firma inválida", () => {
    expect(service.verifyMetaSignature("{}", "sha256=00", "test-meta-app-secret").ok).toBe(false);
  });

  test("normalizeMetaInboundMessage usa wamid y el teléfono", () => {
    const inbound = service.normalizeMetaInboundMessage({
      message: { from: "526181234567", id: "wamid.ABC", type: "text", text: { body: "Sí vamos" } },
      metadata: { phone_number_id: "phone_1" },
    });
    expect(inbound.messageId).toBe("wamid.ABC");
    expect(inbound.from).toBe("526181234567");
    expect(inbound.text).toBe("Sí vamos");
  });

  test("processMetaWhatsappWebhook enruta por phone_number_id y reutiliza el bot", async () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba_1",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "phone_1", display_phone_number: "526181234567" },
                messages: [{ from: "5215511111111", id: "wamid.1", type: "text", text: { body: "Sí confirmo" } }],
              },
            },
          ],
        },
      ],
    };
    const result = await service.processMetaWhatsappWebhook({ payload, rawBody: JSON.stringify(payload) });
    expect(resolveMetaWhatsappByPhoneNumberId).toHaveBeenCalledWith({ phoneNumberId: "phone_1" });
    expect(handleInboundWhatsapp).toHaveBeenCalledWith(
      expect.objectContaining({
        integration: expect.objectContaining({ ownerUserId: "usr_test_1" }),
        payload: expect.objectContaining({ messageId: "wamid.1", text: "Sí confirmo" }),
      }),
    );
    expect(result.processed).toBe(true);
  });

  test("processMetaWhatsappWebhook no inventa un customerId externo", async () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "phone_1" },
                messages: [{ from: "52", id: "wamid.2", type: "text", text: { body: "hola" } }],
              },
            },
          ],
        },
      ],
    };
    await service.processMetaWhatsappWebhook({ payload });
    expect(resolveMetaWhatsappByPhoneNumberId).toHaveBeenCalledTimes(1);
    expect(handleInboundWhatsapp.mock.calls[0][0].integration.ownerUserId).toBe("usr_test_1");
  });
});
