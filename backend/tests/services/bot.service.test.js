import { jest } from "@jest/globals";
import { loadWithMocks, fakeEvent, fakeGuest } from "../helpers/loadWithMocks.js";
import { createInstance } from "../helpers/models.js";

describe("bot.service processGuestMessage", () => {
  let service;
  let models;
  let enqueueJob;
  let processTurn;
  let tryLockBotSession;
  let session;

  async function setup() {
    enqueueJob = jest.fn(async () => undefined);
    processTurn = jest.fn(async ({ executeTool }) => {
      await executeTool({
        name: "actualizar_confirmacion",
        arguments: JSON.stringify({ status: "confirmado", confirmed: 2 }),
      });
      return { reply: "Confirmado", items: [], tools: ["actualizar_confirmacion"] };
    });
    tryLockBotSession = jest.fn(async () => true);
    session = createInstance({
      id: "ses_1",
      eventId: "evt_1",
      guestId: "gst_1",
      userId: "5511111111",
      items: [],
      lockedUntil: null,
    });

    ({ mod: service, models } = await loadWithMocks("src/services/bot/bot.service.js", {
      extraMocks: {
        "src/services/outbound.worker.js": () => ({ enqueueJob }),
        "src/services/bot/openai.service.js": () => ({ processTurn }),
        "src/services/bot/prompt.service.js": () => ({
          buildInstructions: jest.fn(() => "instrucciones"),
          loadEventBotContext: jest.fn(async () => ({
            ai: {},
            templates: [],
            faqs: [],
            vars: {},
            plannerName: "Ana",
          })),
        }),
        "src/services/bot/session.service.js": () => ({
          appendSessionItems: jest.fn(async () => session),
          asItems: (value) => (Array.isArray(value) ? [...value] : []),
          getOrCreateBotSession: jest.fn(async () => session),
          liveUserId: () => "5511111111",
          phonesMatch: () => true,
          refreshBotSessionLock: jest.fn(async () => undefined),
          saveSessionItems: jest.fn(async () => session),
          tryLockBotSession,
          unlockBotSession: jest.fn(async () => undefined),
        }),
        "src/services/activity.service.js": () => ({ logActivity: jest.fn(async () => undefined) }),
      },
    }));
    models.Message.findAll.mockResolvedValue([]);
    models.Message.create.mockResolvedValue({});
  }

  afterEach(() => {
    service?.resetInboundBuffers?.();
    jest.useRealTimers();
  });

  test("dryRun no persiste RSVP ni encola WhatsApp", async () => {
    await setup();
    const event = fakeEvent();
    const guest = fakeGuest({ status: "enviado", confirmed: 0, invited: 2 });
    models.Event.findByPk.mockResolvedValue(event);
    models.Guest.findOne.mockResolvedValue(guest);
    models.Conversation.findOne.mockResolvedValue(null);

    await service.processGuestMessage({
      eventId: event.id,
      guestId: guest.id,
      text: "Confirmamos los dos",
      dryRun: true,
      persistConversation: false,
    });

    expect(guest.save).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(models.Message.create).not.toHaveBeenCalled();
    expect(models.Conversation.create).not.toHaveBeenCalled();
  });

  test("agrupa mensajes seguidos en un solo processTurn", async () => {
    await setup();
    jest.useFakeTimers();
    const event = fakeEvent();
    const guest = fakeGuest({ status: "enviado" });
    const conv = createInstance({ id: "c1", eventId: event.id, guestId: guest.id, aiPaused: false, unread: 0 });
    models.Event.findByPk.mockResolvedValue(event);
    models.Guest.findOne.mockResolvedValue(guest);
    models.Conversation.findOne.mockResolvedValue(conv);
    models.Conversation.create.mockResolvedValue(conv);
    processTurn.mockImplementation(async () => ({ reply: "Hola, ¿podrán acompañarnos?", items: [], tools: [] }));

    const p1 = service.processGuestMessage({
      eventId: event.id,
      guestId: guest.id,
      text: "Hola",
      dryRun: false,
      persistConversation: true,
      debounceMs: 2000,
    });
    const p2 = service.processGuestMessage({
      eventId: event.id,
      guestId: guest.id,
      text: "Buen día",
      dryRun: false,
      persistConversation: true,
      debounceMs: 2000,
    });

    expect(processTurn).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(2000);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(processTurn).toHaveBeenCalledTimes(1);
    const items = processTurn.mock.calls[0][0].items;
    expect(items.at(-1).content).toBe("Hola\nBuen día");
    expect(r1.reply).toBe("Hola, ¿podrán acompañarnos?");
    expect(r2.reply).toBe("Hola, ¿podrán acompañarnos?");
    const aiTexts = models.Message.create.mock.calls
      .map(([row]) => row)
      .filter((row) => row.from === "ai")
      .map((row) => row.text);
    expect(aiTexts).not.toContain("Por favor espera a que termine la respuesta anterior.");
  });

  test("lock ocupado no manda espera y reintenta el turno", async () => {
    await setup();
    jest.useFakeTimers();
    tryLockBotSession.mockResolvedValueOnce(false).mockResolvedValue(true);
    const event = fakeEvent();
    const guest = fakeGuest({ status: "enviado" });
    const conv = createInstance({ id: "c1", eventId: event.id, guestId: guest.id, aiPaused: false, unread: 0 });
    models.Event.findByPk.mockResolvedValue(event);
    models.Guest.findOne.mockResolvedValue(guest);
    models.Conversation.findOne.mockResolvedValue(conv);
    processTurn.mockImplementation(async () => ({ reply: "Claro", items: [], tools: [] }));

    const pending = service.processGuestMessage({
      eventId: event.id,
      guestId: guest.id,
      text: "Hola",
      dryRun: false,
      persistConversation: true,
      debounceMs: 0,
    });

    await jest.advanceTimersByTimeAsync(0);
    expect(processTurn).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(250);
    const result = await pending;

    expect(processTurn).toHaveBeenCalledTimes(1);
    expect(result.reply).toBe("Claro");
    const aiTexts = models.Message.create.mock.calls
      .map(([row]) => row)
      .filter((row) => row.from === "ai")
      .map((row) => row.text);
    expect(aiTexts).not.toContain("Por favor espera a que termine la respuesta anterior.");
    expect(aiTexts).toContain("Claro");
  });
});
