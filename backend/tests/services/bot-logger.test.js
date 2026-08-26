import { jest } from "@jest/globals";
import { botLog, botTurnContext, botTurnResult } from "../../src/services/bot/bot-logger.js";

describe("bot-logger", () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test("botLog siempre incluye el prefijo [BOT]", () => {
    botLog("turn inicio", { guestId: "gst_1" });
    expect(consoleSpy).toHaveBeenCalledWith('[BOT] turn inicio {"guestId":"gst_1"}');
  });

  test("botTurnContext recorta mensajes largos", () => {
    const ctx = botTurnContext({
      event: { id: "evt_1", slug: "boda" },
      guest: { id: "gst_1", rep: "Ana", status: "enviado" },
      message: "x".repeat(300),
      dryRun: true,
      persistConversation: false,
      userId: "playground_evt_1_gst_1",
    });
    expect(ctx.message.length).toBeLessThanOrEqual(181);
    expect(ctx.eventId).toBe("evt_1");
  });

  test("botTurnResult resume intent y tools", () => {
    const summary = botTurnResult({
      intent: "seguimiento",
      reply: "Te escribo luego",
      tools: [{ name: "marcar_seguimiento" }],
      logs: [{ kind: "intent", label: "Seguimiento", value: "seguimiento" }],
    });
    expect(summary.intent).toBe("seguimiento");
    expect(summary.tools).toEqual(["marcar_seguimiento"]);
  });
});
