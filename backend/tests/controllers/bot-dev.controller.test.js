import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks, fakeEvent } from "../helpers/controller.js";
import { createInstance } from "../helpers/models.js";

describe("bot-dev.controller playground", () => {
  let controller;
  let models;
  const getBotSession = jest.fn();
  const appendOutboundToSession = jest.fn();
  const resolveOpeningText = jest.fn();
  const loadEventBotContext = jest.fn();
  const deleteBotSession = jest.fn();
  const processGuestMessage = jest.fn();

  beforeEach(async () => {
    getBotSession.mockReset();
    appendOutboundToSession.mockReset();
    resolveOpeningText.mockReset();
    loadEventBotContext.mockReset();
    deleteBotSession.mockReset();
    processGuestMessage.mockReset();

    ({ mod: controller, models } = await loadWithMocks("src/controllers/bot-dev.controller.js", {
      extraMocks: {
        "src/services/access.service.js": () => ({
          requireEvent: jest.fn(async () => fakeEvent()),
          userEventIds: jest.fn(async () => ["evt_1"]),
        }),
        "src/services/bot/session.service.js": () => ({
          deleteBotSession,
          getBotSession,
          playgroundUserId: (eventId, guestId) => `playground_${eventId}_${guestId}`,
          asItems: (value) => (Array.isArray(value) ? [...value] : []),
        }),
        "src/services/bot/bot.service.js": () => ({
          appendOutboundToSession,
          processGuestMessage,
        }),
        "src/services/bot/prompt.service.js": () => ({
          buildInstructions: jest.fn(() => "prompt"),
          loadEventBotContext,
        }),
        "src/services/templates.service.js": () => ({
          resolveOpeningText,
        }),
        "src/services/bot/openai.service.js": () => ({
          itemsToChat: (items) =>
            (items || [])
              .filter((item) => item?.type === "message")
              .map((item) => ({
                role: item.role === "user" ? "user" : "assistant",
                text: item.content,
              })),
        }),
        "src/utils/serialize.js": () => ({
          serializeConversation: jest.fn(),
          serializeMessage: jest.fn(),
        }),
      },
    }));
  });

  test("getPlayground siembra la invitación inicial si la sesión está vacía", async () => {
    const guest = createInstance({ id: "gst_1", eventId: "evt_1", rep: "Ana" });
    models.Guest.findOne.mockResolvedValue(guest);
    getBotSession.mockResolvedValue(null);
    loadEventBotContext.mockResolvedValue({ ai: { openingMessage: "fallback" }, plannerName: "Ana" });
    resolveOpeningText.mockResolvedValue("Hola Ana, ¿podrán acompañarnos?");
    appendOutboundToSession.mockResolvedValue({
      items: [{ type: "message", role: "assistant", content: "Hola Ana, ¿podrán acompañarnos?" }],
    });

    const { res } = await callHandler(controller.getPlayground, {
      req: createMockReq({ params: { eventId: "boda-ana" }, query: { guestId: "gst_1" } }),
    });

    expect(appendOutboundToSession).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "assistant", text: "Hola Ana, ¿podrán acompañarnos?" }],
      }),
    );
  });

  test("postPlayground expone intent y logs del turno", async () => {
    const guest = createInstance({ id: "gst_1", eventId: "evt_1", rep: "Ana" });
    models.Guest.findOne.mockResolvedValue(guest);
    getBotSession.mockResolvedValue({
      items: [{ type: "message", role: "assistant", content: "Hola" }],
    });
    processGuestMessage.mockResolvedValue({
      reply: "Te escribo luego",
      intent: "seguimiento",
      logs: [{ kind: "intent", label: "Seguimiento", value: "seguimiento" }],
      tools: [{ name: "marcar_seguimiento" }],
      items: [
        { type: "message", role: "assistant", content: "Hola" },
        { type: "message", role: "user", content: "luego te digo" },
        {
          type: "message",
          role: "assistant",
          content: JSON.stringify({ reply: "Te escribo luego", intent: "seguimiento" }),
        },
      ],
    });

    const { res } = await callHandler(controller.postPlayground, {
      req: createMockReq({
        params: { eventId: "boda-ana" },
        body: { guestId: "gst_1", message: "luego te digo" },
      }),
    });

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "seguimiento",
        logs: [expect.objectContaining({ kind: "intent", value: "seguimiento" })],
      }),
    );
  });
});
