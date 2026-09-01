import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks } from "../helpers/controller.js";

function cloudPayload({ waId = "5216181556489", text = "hola", id = "wamid.abc" } = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
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

  beforeEach(async () => {
    handleInboundWhatsapp = jest.fn(async () => ({ processed: true, reason: "ai_reply" }));
    ({ mod: controller } = await loadWithMocks("src/controllers/meta-webhook.controller.js", {
      extraMocks: {
        "src/controllers/bot.controller.js": () => ({ handleInboundWhatsapp }),
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

  test("POST procesa inbound Cloud API sin integración WC", async () => {
    const payload = cloudPayload();
    const raw = JSON.stringify(payload);
    const { res } = await callHandler(controller.postMetaEvents, {
      req: createMockReq({ body: payload, rawBody: raw }),
    });
    expect(handleInboundWhatsapp).toHaveBeenCalledWith({
      payload: expect.objectContaining({ from: "6181556489", text: "hola", messageId: "wamid.abc" }),
      integration: null,
      rawBody: "wamid.abc",
    });
    expect(res.status).toHaveBeenCalledWith(200);
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
