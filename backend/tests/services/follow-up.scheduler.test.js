import { jest } from "@jest/globals";
import { loadWithMocks, fakeEvent, fakeGuest } from "../helpers/loadWithMocks.js";
import { addDays, formatFollowUpDate, INDECISO_NUDGE_ID } from "../../src/services/follow-up.service.js";

describe("follow-up.scheduler", () => {
  let scheduler;
  let models;
  let deliverAiMessage;
  let resolveSeguimientoText;
  let resolveReminderText;

  beforeEach(async () => {
    deliverAiMessage = jest.fn(async () => undefined);
    resolveSeguimientoText = jest.fn(async (_event, guest) => `Nudge ${guest.rep}`);
    resolveReminderText = jest.fn(async () => "Recordatorio");
    ({ mod: scheduler, models } = await loadWithMocks("src/services/follow-up.scheduler.js", {
      extraMocks: {
        "src/services/guest-message.service.js": () => ({ deliverAiMessage }),
        "src/services/templates.service.js": () => ({ resolveSeguimientoText, resolveReminderText }),
        "src/services/integration-resolver.service.js": () => ({
          assertWhatsappReady: jest.fn(async () => undefined),
        }),
        "src/services/activity.service.js": () => ({ logActivity: jest.fn(async () => undefined) }),
      },
    }));
  });

  function stubEventGuests(guests, ai = { followUps: [] }) {
    const event = fakeEvent({ status: "activo" });
    models.Event.findAll.mockResolvedValue([event]);
    models.AiConfig.findOne.mockResolvedValue(ai);
    models.Guest.findAll.mockResolvedValue(guests);
    models.Conversation.findAll.mockResolvedValue([]);
    models.User.findByPk.mockResolvedValue({ name: "Ana" });
    return event;
  }

  test("envía plantilla Seguimiento cuando la fecha del indeciso ya venció", async () => {
    const guest = fakeGuest({
      status: "seguimiento",
      followUp: formatFollowUpDate(addDays(new Date(), -1)),
      followUpsSent: [],
    });
    stubEventGuests([guest]);
    await scheduler.tickFollowUps();
    expect(resolveSeguimientoText).toHaveBeenCalled();
    expect(deliverAiMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        guest,
        kind: "seguimiento",
        followUpId: INDECISO_NUDGE_ID,
        text: "Nudge Luis Pérez",
      }),
    );
    expect(guest.followUp).toBe("");
    expect(guest.followUpsSent).toContain(INDECISO_NUDGE_ID);
    expect(resolveReminderText).not.toHaveBeenCalled();
  });

  test("no envía si la fecha de seguimiento aún no vence", async () => {
    const guest = fakeGuest({
      status: "seguimiento",
      followUp: formatFollowUpDate(addDays(new Date(), 3)),
      followUpsSent: [],
    });
    stubEventGuests([guest]);
    await scheduler.tickFollowUps();
    expect(deliverAiMessage).not.toHaveBeenCalled();
  });

  test("no aplica el drip de Recordatorio a invitados en seguimiento", async () => {
    const guest = fakeGuest({
      status: "seguimiento",
      followUp: formatFollowUpDate(addDays(new Date(), -1)),
      followUpsSent: [],
      contactedAt: addDays(new Date(), -10),
    });
    stubEventGuests([guest], {
      followUps: [{ id: "f2", label: "Primer recordatorio", when: "7 días después del primer contacto", active: true }],
    });
    await scheduler.tickFollowUps();
    expect(deliverAiMessage).toHaveBeenCalledTimes(1);
    expect(deliverAiMessage.mock.calls[0][0].kind).toBe("seguimiento");
    expect(resolveReminderText).not.toHaveBeenCalled();
  });
});
