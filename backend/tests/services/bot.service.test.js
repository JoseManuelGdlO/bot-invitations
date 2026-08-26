import { jest } from "@jest/globals";
import { loadWithMocks, fakeEvent, fakeGuest } from "../helpers/loadWithMocks.js";
import { createInstance } from "../helpers/models.js";

describe("bot.service dryRun", () => {
  let service;
  let models;
  let enqueueJob;
  let processTurn;

  beforeEach(async () => {
    enqueueJob = jest.fn(async () => undefined);
    processTurn = jest.fn(async ({ executeTool }) => {
      await executeTool({
        name: "actualizar_confirmacion",
        arguments: JSON.stringify({ status: "confirmado", confirmed: 2 }),
      });
      return { reply: "Confirmado", items: [], tools: ["actualizar_confirmacion"] };
    });

    const session = createInstance({
      id: "ses_1",
      eventId: "evt_1",
      guestId: "gst_1",
      userId: "playground",
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
          tryLockBotSession: jest.fn(async () => true),
          unlockBotSession: jest.fn(async () => undefined),
        }),
        "src/services/activity.service.js": () => ({ logActivity: jest.fn(async () => undefined) }),
      },
    }));
  });

  test("dryRun no persiste RSVP ni encola WhatsApp", async () => {
    const event = fakeEvent();
    const guest = fakeGuest({ status: "enviado", confirmed: 0, invited: 2 });
    guest.reload = jest.fn(async () => guest);
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
});
