import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks } from "../helpers/controller.js";

function cloudPayload({
  waId = "5216181556489",
  text = "hola",
  id = "wamid.abc",
  phoneNumberId = "10987654321",
} = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15551234567",
                phone_number_id: phoneNumberId,
              },
              contacts: [{ wa_id: waId, profile: { name: "Luis" } }],
              messages: [
                {
                  from: waId,
                  id,
                  timestamp: "1700000000",
                  type: "text",
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe("meta-webhook.controller", () => {
  let controller;
  let handleInboundWhatsapp;
  let resolveActiveWhatsappMetaByPhoneNumberId;
  const integration = { id: "wa_int_1", ownerUserId: "usr_1", phoneNumberId: "10987654321" };

  beforeEach(async () => {
    handleInboundWhatsapp = jest.fn(async () => ({ processed: true, reason: "ai_reply" }));
    resolveActiveWhatsappMetaByPhoneNumberId = jest.fn(async () => ({
      integration,
      credentials: { accessToken: "tok", phoneNumberId: "10987654321" },
    }));
    ({ mod: controller } = await loadWithMocks("src/controllers/meta-webhook.controller.js", {
      extraMocks: {
        "src/controllers/bot.controller.js": () => ({ handleInboundWhatsapp }),
        "src/services/whatsapp-meta.service.js": () => ({
          resolveActiveWhatsappMetaByPhoneNumberId,
        }),
      },
    }));
  });

  test("extractMetaInboundMessages normaliza wa_id a 10 dígitos", () => {
    const messages = controller.extractMetaInboundMessages(cloudPayload());
    expect(messages).toEqual([
      expect.objectContaining({
        type: "message.inbound",
        from: "6181556489",
        fromPhone: "6181556489",
        text: "hola",
        messageId: "wamid.abc",
        messageType: "text",
        phoneNumberId: "10987654321",
      }),
    ]);
  });

  test("extractMetaInboundMessages lee botón interactive", () => {
    const body = cloudPayload();
    body.entry[0].changes[0].value.messages[0] = {
      from: "6181556489",
      id: "wamid.btn",
      type: "interactive",
      interactive: { button_reply: { id: "yes", title: "Confirmar" } },
    };
    const messages = controller.extractMetaInboundMessages(body);
    expect(messages[0].text).toBe("Confirmar");
    expect(messages[0].messageType).toBe("interactive");
  });

  test("POST rutea inbound al owner del phone_number_id", async () => {
    const payload = cloudPayload();
    const raw = JSON.stringify(payload);
    const { res } = await callHandler(controller.postMetaEvents, {
      req: createMockReq({ body: payload, rawBody: raw }),
    });
    expect(resolveActiveWhatsappMetaByPhoneNumberId).toHaveBeenCalledWith("10987654321");
    expect(handleInboundWhatsapp).toHaveBeenCalledWith({
      payload: expect.objectContaining({ from: "6181556489", text: "hola", messageId: "wamid.abc" }),
      integration,
      rawBody: "wamid.abc",
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("POST sin phone_number_id no llama al bot", async () => {
    const payload = cloudPayload({ phoneNumberId: "" });
    delete payload.entry[0].changes[0].value.metadata;
    const { res } = await callHandler(controller.postMetaEvents, {
      req: createMockReq({ body: payload, rawBody: JSON.stringify(payload) }),
    });
    expect(handleInboundWhatsapp).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        results: [expect.objectContaining({ reason: "missing_phone_number_id" })],
      }),
    );
  });

  test("POST sin integración conocida no llama al bot", async () => {
    resolveActiveWhatsappMetaByPhoneNumberId.mockResolvedValue(null);
    const payload = cloudPayload();
    const { res } = await callHandler(controller.postMetaEvents, {
      req: createMockReq({ body: payload, rawBody: JSON.stringify(payload) }),
    });
    expect(handleInboundWhatsapp).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        results: [expect.objectContaining({ reason: "integration_not_found" })],
      }),
    );
  });

  test("POST sin messages responde 200 y no llama al bot", async () => {
    const payload = { object: "whatsapp_business_account", entry: [{ changes: [{ value: { statuses: [] } }] }] };
    const { res } = await callHandler(controller.postMetaEvents, {
      req: createMockReq({ body: payload, rawBody: JSON.stringify(payload) }),
    });
    expect(handleInboundWhatsapp).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
