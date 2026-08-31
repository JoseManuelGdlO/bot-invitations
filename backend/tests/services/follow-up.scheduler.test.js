import { jest } from "@jest/globals";
import { loadWithMocks, fakeEvent, fakeGuest } from "../helpers/loadWithMocks.js";
import {
  addDays,
  formatFollowUpDate,
  INDECISO_NUDGE_ID,
  startOfDay,
} from "../../src/services/follow-up.service.js";

function toIso(date) {
  const d = startOfDay(date);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const DEFAULT_RULES = [
  { id: "f1", label: "Primer contacto", days: 30, when: "30 días antes del evento", active: true },
  { id: "f2", label: "Primer recordatorio", days: 7, when: "7 días después del primer contacto", active: true },
  { id: "f3", label: "Segundo recordatorio", days: 14, when: "14 días después del primer contacto", active: true },
  { id: "f4", label: "Último intento", days: 7, when: "7 días antes del evento", active: false },
  { id: "indeciso", label: "Recontacto a indecisos", days: 3, when: "3 días después de marcar seguimiento", active: true },
];

describe("follow-up.scheduler", () => {
  let scheduler;
  let models;
  let deliverAiMessage;
  let resolveSeguimientoText;
  let resolveReminderText;
  let assertWhatsappReady;

  beforeEach(async () => {
    deliverAiMessage = jest.fn(async () => undefined);
    resolveSeguimientoText = jest.fn(async (_event, guest) => `Nudge ${guest.rep}`);
    resolveReminderText = jest.fn(async () => "Recordatorio");
    assertWhatsappReady = jest.fn(async () => undefined);
    ({ mod: scheduler, models } = await loadWithMocks("src/services/follow-up.scheduler.js", {
      extraMocks: {
        "src/services/guest-message.service.js": () => ({ deliverAiMessage }),
        "src/services/templates.service.js": () => ({ resolveSeguimientoText, resolveReminderText }),
        "src/services/integration-resolver.service.js": () => ({
          assertWhatsappReady,
        }),
        "src/services/activity.service.js": () => ({ logActivity: jest.fn(async () => undefined) }),
      },
    }));
  });

  function stubEventGuests(guests, ai = { followUps: [] }, eventOverrides = {}) {
    const event = fakeEvent({ status: "activo", ...eventOverrides });
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

  test("no envía nudge si la regla indeciso está apagada", async () => {
    const guest = fakeGuest({
      status: "seguimiento",
      followUp: formatFollowUpDate(addDays(new Date(), -1)),
      followUpsSent: [],
    });
    stubEventGuests([guest], {
      followUps: [{ id: "indeciso", label: "Recontacto a indecisos", days: 3, when: "3 días después de marcar seguimiento", active: false }],
    });
    await scheduler.tickFollowUps();
    expect(deliverAiMessage).not.toHaveBeenCalled();
  });

  test("el drip no envía la regla indeciso aunque esté activa", async () => {
    const guest = fakeGuest({
      status: "enviado",
      followUp: "",
      followUpsSent: [],
      contactedAt: addDays(new Date(), -10),
    });
    stubEventGuests([guest], {
      followUps: [
        { id: "indeciso", label: "Recontacto a indecisos", days: 3, when: "3 días después de marcar seguimiento", active: true },
        { id: "f2", label: "Primer recordatorio", days: 7, when: "7 días después del primer contacto", active: true },
      ],
    });
    await scheduler.tickFollowUps();
    expect(deliverAiMessage).toHaveBeenCalledTimes(1);
    expect(deliverAiMessage.mock.calls[0][0].kind).toBe("follow_up");
    expect(deliverAiMessage.mock.calls[0][0].followUpId).toBe("f2");
    expect(resolveSeguimientoText).not.toHaveBeenCalled();
  });

  test("envía f2 cuando ya venció el plazo desde el primer contacto", async () => {
    const guest = fakeGuest({
      status: "enviado",
      followUpsSent: [],
      contactedAt: addDays(new Date(), -8),
    });
    stubEventGuests([guest], { followUps: DEFAULT_RULES });
    await scheduler.tickFollowUps();
    expect(resolveReminderText).toHaveBeenCalled();
    expect(deliverAiMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        guest,
        kind: "follow_up",
        followUpId: "f2",
        text: "Recordatorio",
      }),
    );
    expect(guest.followUpsSent).toContain("f2");
    expect(guest.followUp).toBe(formatFollowUpDate(addDays(guest.contactedAt, 14)));
    expect(guest.save).toHaveBeenCalled();
  });

  test("no envía f2 si el plazo todavía no vence", async () => {
    const guest = fakeGuest({
      status: "enviado",
      followUpsSent: [],
      contactedAt: addDays(new Date(), -2),
    });
    stubEventGuests([guest], { followUps: DEFAULT_RULES });
    await scheduler.tickFollowUps();
    expect(deliverAiMessage).not.toHaveBeenCalled();
  });

  test("ignora Primer contacto aunque la regla esté activa y vencida", async () => {
    const guest = fakeGuest({
      status: "enviado",
      followUpsSent: [],
      contactedAt: addDays(new Date(), -1),
    });
    stubEventGuests([guest], {
      followUps: [
        { id: "f1", label: "Primer contacto", days: 1, when: "1 día antes del evento", active: true },
      ],
    }, { date: toIso(addDays(new Date(), 1)) });
    await scheduler.tickFollowUps();
    expect(deliverAiMessage).not.toHaveBeenCalled();
  });

  test("no envía una regla inactiva", async () => {
    const guest = fakeGuest({
      status: "enviado",
      followUpsSent: [],
      contactedAt: addDays(new Date(), -10),
    });
    stubEventGuests([guest], {
      followUps: DEFAULT_RULES.map((rule) => (rule.id === "f2" || rule.id === "f3" ? { ...rule, active: false } : rule)),
    });
    await scheduler.tickFollowUps();
    expect(deliverAiMessage).not.toHaveBeenCalled();
  });

  test("no reenvía f2 y pasa a f3 si ya se mandó el primero", async () => {
    const guest = fakeGuest({
      status: "en_conversacion",
      followUpsSent: ["f2"],
      contactedAt: addDays(new Date(), -15),
    });
    stubEventGuests([guest], { followUps: DEFAULT_RULES });
    await scheduler.tickFollowUps();
    expect(deliverAiMessage).toHaveBeenCalledTimes(1);
    expect(deliverAiMessage.mock.calls[0][0].followUpId).toBe("f3");
    expect(guest.followUpsSent).toEqual(["f2", "f3"]);
  });

  test("envía f4 anclado a la fecha del evento cuando está activo", async () => {
    const guest = fakeGuest({
      status: "enviado",
      followUpsSent: ["f2", "f3"],
      contactedAt: addDays(new Date(), -2),
    });
    stubEventGuests(
      [guest],
      {
        followUps: DEFAULT_RULES.map((rule) => (rule.id === "f4" ? { ...rule, active: true } : rule)),
      },
      { date: toIso(addDays(new Date(), 5)) },
    );
    await scheduler.tickFollowUps();
    expect(deliverAiMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "follow_up", followUpId: "f4" }),
    );
    expect(guest.followUpsSent).toContain("f4");
  });

  test("no envía si el invitado no tiene teléfono", async () => {
    const guest = fakeGuest({
      status: "enviado",
      phone: "",
      followUpsSent: [],
      contactedAt: addDays(new Date(), -10),
    });
    stubEventGuests([guest], { followUps: DEFAULT_RULES });
    await scheduler.tickFollowUps();
    expect(deliverAiMessage).not.toHaveBeenCalled();
  });

  test("no envía si la conversación tiene la IA pausada", async () => {
    const guest = fakeGuest({
      status: "enviado",
      followUpsSent: [],
      contactedAt: addDays(new Date(), -10),
    });
    stubEventGuests([guest], { followUps: DEFAULT_RULES });
    models.Conversation.findAll.mockResolvedValue([{ guestId: guest.id, aiPaused: true }]);
    await scheduler.tickFollowUps();
    expect(deliverAiMessage).not.toHaveBeenCalled();
  });

  test("no envía si WhatsApp no está listo", async () => {
    assertWhatsappReady.mockRejectedValue(new Error("WhatsApp no conectado"));
    const guest = fakeGuest({
      status: "enviado",
      followUpsSent: [],
      contactedAt: addDays(new Date(), -10),
    });
    stubEventGuests([guest], { followUps: DEFAULT_RULES });
    await scheduler.tickFollowUps();
    expect(deliverAiMessage).not.toHaveBeenCalled();
  });

  describe("cada regla se envía en el tiempo configurado", () => {
    test("f2: no en día 6, sí en día 7 desde el primer contacto", async () => {
      const early = fakeGuest({
        id: "gst_early",
        status: "enviado",
        followUpsSent: [],
        contactedAt: addDays(new Date(), -6),
      });
      stubEventGuests([early], {
        followUps: [{ id: "f2", label: "Primer recordatorio", days: 7, when: "7 días después del primer contacto", active: true }],
      });
      await scheduler.tickFollowUps();
      expect(deliverAiMessage).not.toHaveBeenCalled();

      const due = fakeGuest({
        id: "gst_due",
        status: "enviado",
        followUpsSent: [],
        contactedAt: addDays(new Date(), -7),
      });
      stubEventGuests([due], {
        followUps: [{ id: "f2", label: "Primer recordatorio", days: 7, when: "7 días después del primer contacto", active: true }],
      });
      await scheduler.tickFollowUps();
      expect(deliverAiMessage).toHaveBeenCalledWith(expect.objectContaining({ followUpId: "f2", kind: "follow_up" }));
    });

    test("f2 con days=5: no en día 4, sí en día 5", async () => {
      const rule = { id: "f2", label: "Primer recordatorio", days: 5, when: "5 días después del primer contacto", active: true };
      stubEventGuests([
        fakeGuest({ status: "enviado", followUpsSent: [], contactedAt: addDays(new Date(), -4) }),
      ], { followUps: [rule] });
      await scheduler.tickFollowUps();
      expect(deliverAiMessage).not.toHaveBeenCalled();

      stubEventGuests([
        fakeGuest({ status: "enviado", followUpsSent: [], contactedAt: addDays(new Date(), -5) }),
      ], { followUps: [rule] });
      await scheduler.tickFollowUps();
      expect(deliverAiMessage).toHaveBeenCalledWith(expect.objectContaining({ followUpId: "f2" }));
    });

    test("f3: no en día 13, sí en día 14 (con f2 ya enviado)", async () => {
      const rule = { id: "f3", label: "Segundo recordatorio", days: 14, when: "14 días después del primer contacto", active: true };
      stubEventGuests([
        fakeGuest({ status: "enviado", followUpsSent: ["f2"], contactedAt: addDays(new Date(), -13) }),
      ], { followUps: [rule] });
      await scheduler.tickFollowUps();
      expect(deliverAiMessage).not.toHaveBeenCalled();

      stubEventGuests([
        fakeGuest({ status: "enviado", followUpsSent: ["f2"], contactedAt: addDays(new Date(), -14) }),
      ], { followUps: [rule] });
      await scheduler.tickFollowUps();
      expect(deliverAiMessage).toHaveBeenCalledWith(expect.objectContaining({ followUpId: "f3" }));
    });

    test("f4: no 8 días antes del evento, sí 7 días antes", async () => {
      const rule = { id: "f4", label: "Último intento", days: 7, when: "7 días antes del evento", active: true };
      const guest = fakeGuest({ status: "enviado", followUpsSent: [], contactedAt: addDays(new Date(), -1) });

      stubEventGuests([guest], { followUps: [rule] }, { date: toIso(addDays(new Date(), 8)) });
      await scheduler.tickFollowUps();
      expect(deliverAiMessage).not.toHaveBeenCalled();

      stubEventGuests([guest], { followUps: [rule] }, { date: toIso(addDays(new Date(), 7)) });
      await scheduler.tickFollowUps();
      expect(deliverAiMessage).toHaveBeenCalledWith(expect.objectContaining({ followUpId: "f4" }));
    });

    test("f4 con days=3: no 4 días antes, sí 3 días antes", async () => {
      const rule = { id: "f4", label: "Último intento", days: 3, when: "3 días antes del evento", active: true };
      const guest = fakeGuest({ status: "enviado", followUpsSent: [], contactedAt: addDays(new Date(), -1) });

      stubEventGuests([guest], { followUps: [rule] }, { date: toIso(addDays(new Date(), 4)) });
      await scheduler.tickFollowUps();
      expect(deliverAiMessage).not.toHaveBeenCalled();

      stubEventGuests([guest], { followUps: [rule] }, { date: toIso(addDays(new Date(), 3)) });
      await scheduler.tickFollowUps();
      expect(deliverAiMessage).toHaveBeenCalledWith(expect.objectContaining({ followUpId: "f4" }));
    });

    test("indeciso: no el día anterior, sí el día de la fecha agendada", async () => {
      stubEventGuests([
        fakeGuest({
          status: "seguimiento",
          followUp: formatFollowUpDate(addDays(new Date(), 1)),
          followUpsSent: [],
        }),
      ], {
        followUps: [{ id: "indeciso", label: "Recontacto a indecisos", days: 3, when: "3 días después de marcar seguimiento", active: true }],
      });
      await scheduler.tickFollowUps();
      expect(deliverAiMessage).not.toHaveBeenCalled();

      stubEventGuests([
        fakeGuest({
          status: "seguimiento",
          followUp: formatFollowUpDate(new Date()),
          followUpsSent: [],
        }),
      ], {
        followUps: [{ id: "indeciso", label: "Recontacto a indecisos", days: 3, when: "3 días después de marcar seguimiento", active: true }],
      });
      await scheduler.tickFollowUps();
      expect(deliverAiMessage).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "seguimiento", followUpId: INDECISO_NUDGE_ID }),
      );
    });
  });
});
