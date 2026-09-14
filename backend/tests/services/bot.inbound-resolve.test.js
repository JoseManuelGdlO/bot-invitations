import { jest } from "@jest/globals";
import { Op } from "sequelize";
import { loadWithMocks, fakeEvent, fakeGuest } from "../helpers/loadWithMocks.js";

function guestForEvent(event, overrides = {}) {
  return fakeGuest({ eventId: event.id, Event: event, event, ...overrides });
}

function guestFindAllArg(models) {
  return models.Guest.findAll.mock.calls[0][0];
}

describe("resolveGuestForInbound", () => {
  let service;
  let models;

  beforeEach(async () => {
    ({ mod: service, models } = await loadWithMocks("src/services/bot/bot.service.js", {
      extraMocks: {
        "src/services/outbound.worker.js": () => ({ enqueueJob: jest.fn() }),
      },
    }));
  });

  test("sin ownerUserId hace un JOIN a eventos activos y matchea por 10 dígitos", async () => {
    const event = fakeEvent({ ownerId: "usr_1", status: "activo" });
    const guest = guestForEvent(event, { phone: "+52 618 155 6489" });
    models.Guest.findAll.mockResolvedValue([guest]);
    const resolved = await service.resolveGuestForInbound({
      chatId: "6181556489",
      displayPhone: "6181556489",
    });
    expect(models.Event.findAll).not.toHaveBeenCalled();
    expect(models.Guest.findAll).toHaveBeenCalledTimes(1);
    const arg = guestFindAllArg(models);
    expect(arg.where).toEqual({ phoneDigits: "6181556489" });
    expect(arg.include).toEqual([
      expect.objectContaining({
        model: models.Event,
        required: true,
        where: { status: "activo" },
      }),
    ]);
    expect(resolved.guest).toBe(guest);
    expect(resolved.event).toBe(event);
  });

  test("con ownerUserId filtra el JOIN por ownerId", async () => {
    const event = fakeEvent({ ownerId: "usr_1", status: "activo" });
    const guest = guestForEvent(event, { phone: "6181556489" });
    models.Guest.findAll.mockResolvedValue([guest]);
    await service.resolveGuestForInbound({
      ownerUserId: "usr_1",
      chatId: "5216181556489",
      displayPhone: "6181556489",
    });
    expect(models.Event.findAll).not.toHaveBeenCalled();
    expect(guestFindAllArg(models).include[0].where).toEqual({
      status: "activo",
      ownerId: "usr_1",
    });
  });

  test("wa_id 521… coincide con teléfono de 10 dígitos", async () => {
    const event = fakeEvent({ status: "activo" });
    const guest = guestForEvent(event, { phone: "6181556489" });
    models.Guest.findAll.mockResolvedValue([guest]);
    const resolved = await service.resolveGuestForInbound({
      displayPhone: "6181556489",
      chatId: "5216181556489",
    });
    expect(guestFindAllArg(models).where).toEqual({ phoneDigits: "6181556489" });
    expect(resolved.guest.id).toBe(guest.id);
    expect(resolved.event).toBe(event);
  });

  test("número desconocido o solo en evento inactivo retorna null", async () => {
    models.Guest.findAll.mockResolvedValue([]);
    const resolved = await service.resolveGuestForInbound({
      ownerUserId: "usr_1",
      chatId: "5511111111",
      displayPhone: "5511111111",
    });
    expect(resolved).toBeNull();
  });

  test("sin dígitos ni JID no consulta la base", async () => {
    const resolved = await service.resolveGuestForInbound({
      chatId: "",
      displayPhone: "",
    });
    expect(resolved).toBeNull();
    expect(models.Guest.findAll).not.toHaveBeenCalled();
  });

  test("chatId con JID busca por phoneDigits o whatsappChatId", async () => {
    const event = fakeEvent({ ownerId: "usr_1", status: "activo" });
    const guest = guestForEvent(event, {
      phone: "6181556489",
      whatsappChatId: "5216181556489@s.whatsapp.net",
    });
    models.Guest.findAll.mockResolvedValue([guest]);
    const resolved = await service.resolveGuestForInbound({
      ownerUserId: "usr_1",
      chatId: "5216181556489@s.whatsapp.net",
      displayPhone: "6181556489",
    });
    expect(guestFindAllArg(models).where).toEqual({
      [Op.or]: [
        { phoneDigits: "6181556489" },
        { whatsappChatId: "5216181556489@s.whatsapp.net" },
      ],
    });
    expect(resolved.guest).toBe(guest);
  });

  test("dos eventos activo mismo teléfono elige la conversación más reciente", async () => {
    const eventA = fakeEvent({ id: "evt_a", status: "activo", date: "2027-06-01" });
    const eventB = fakeEvent({ id: "evt_b", status: "activo", date: "2027-01-01" });
    const guestA = guestForEvent(eventA, { id: "gst_a", phone: "6181556489" });
    const guestB = guestForEvent(eventB, { id: "gst_b", phone: "6181556489" });
    models.Guest.findAll.mockResolvedValue([guestA, guestB]);
    models.Conversation.findAll.mockResolvedValue([{ guestId: guestB.id }]);
    const resolved = await service.resolveGuestForInbound({
      displayPhone: "6181556489",
      chatId: "6181556489",
    });
    expect(resolved.guest).toBe(guestB);
    expect(resolved.event).toBe(eventB);
  });
});
