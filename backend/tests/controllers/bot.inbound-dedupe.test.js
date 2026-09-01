import { jest } from "@jest/globals";
import { loadWithMocks } from "../helpers/loadWithMocks.js";
import { createInstance } from "../helpers/models.js";

describe("handleInboundWhatsapp dedupe", () => {
  let handleInboundWhatsapp;
  let processGuestMessage;
  let resolveGuestForInbound;
  let rememberWhatsappChatId;
  let claimInboundEvent;
  let enqueueJob;

  const guest = createInstance({ id: "gst_1", eventId: "evt_1", phone: "6181556489" });
  const event = createInstance({ id: "evt_1", ownerId: "usr_1" });
  const integration = { id: "int_1", ownerUserId: "usr_1" };
  const payload = {
    deviceId: "dev_1",
    type: "message.inbound",
    normalized: {
      from: "5216181556489@s.whatsapp.net",
      fromPhone: "6181556489",
      content: { type: "text", text: "hola" },
    },
  };
  const rawBody = JSON.stringify(payload);

  beforeEach(async () => {
    processGuestMessage = jest.fn(async () => ({ skipped: false, reply: "ok", conversationId: "c1" }));
    resolveGuestForInbound = jest.fn(async () => ({ guest, event }));
    rememberWhatsappChatId = jest.fn(async () => guest);
    claimInboundEvent = jest.fn(async () => ({ duplicate: false }));
    enqueueJob = jest.fn(async () => undefined);

    const { mod } = await loadWithMocks("src/controllers/bot.controller.js", {
      extraMocks: {
        "src/services/outbound.worker.js": () => ({ enqueueJob }),
        "src/services/bot/bot.service.js": () => ({
          processGuestMessage,
          rememberWhatsappChatId,
          resolveGuestForInbound,
        }),
        "src/services/inbound-dedupe.service.js": () => ({
          claimInboundEvent,
          inboundDedupeKey: () => "body:test-key",
        }),
      },
    });
    handleInboundWhatsapp = mod.handleInboundWhatsapp;
  });

  test("primer inbound llama al bot", async () => {
    const result = await handleInboundWhatsapp({ payload, integration, rawBody });
    expect(result.reason).toBe("ai_reply");
    expect(processGuestMessage).toHaveBeenCalledTimes(1);
    expect(claimInboundEvent).toHaveBeenCalled();
  });

  test("sin integración WC busca invitado y llama al bot", async () => {
    const result = await handleInboundWhatsapp({ payload, rawBody });
    expect(resolveGuestForInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: null,
        displayPhone: "6181556489",
      }),
    );
    expect(result.reason).toBe("ai_reply");
    expect(processGuestMessage).toHaveBeenCalledTimes(1);
  });

  test("replay del mismo evento no llama al bot", async () => {
    claimInboundEvent.mockResolvedValueOnce({ duplicate: true });
    const result = await handleInboundWhatsapp({ payload, integration, rawBody });
    expect(result).toEqual({
      processed: true,
      reason: "duplicate_event",
      eventId: "evt_1",
      guestId: "gst_1",
    });
    expect(processGuestMessage).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});
