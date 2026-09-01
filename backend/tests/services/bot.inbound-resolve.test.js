import { jest } from "@jest/globals";
import { loadWithMocks, fakeEvent, fakeGuest } from "../helpers/loadWithMocks.js";

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

  test("sin ownerUserId busca en todos los eventos y matchea por 10 dígitos", async () => {
    const event = fakeEvent({ ownerId: "usr_1", status: "activo" });
    const guest = fakeGuest({ phone: "+52 618 155 6489", eventId: event.id });
    models.Event.findAll.mockResolvedValue([event]);
    models.Guest.findAll.mockResolvedValue([guest]);
    const resolved = await service.resolveGuestForInbound({
      chatId: "6181556489",
      displayPhone: "6181556489",
    });
    expect(models.Event.findAll).toHaveBeenCalledWith();
    expect(resolved.guest).toBe(guest);
    expect(resolved.event).toBe(event);
  });

  test("con ownerUserId filtra eventos del owner", async () => {
    const event = fakeEvent({ ownerId: "usr_1" });
    const guest = fakeGuest({ phone: "6181556489", eventId: event.id });
    models.Event.findAll.mockResolvedValue([event]);
    models.Guest.findAll.mockResolvedValue([guest]);
    await service.resolveGuestForInbound({
      ownerUserId: "usr_1",
      chatId: "5216181556489",
      displayPhone: "6181556489",
    });
    expect(models.Event.findAll).toHaveBeenCalledWith({ where: { ownerId: "usr_1" } });
  });

  test("wa_id 521… coincide con teléfono de 10 dígitos", async () => {
    const event = fakeEvent({ status: "activo" });
    const guest = fakeGuest({ phone: "6181556489" });
    models.Event.findAll.mockResolvedValue([event]);
    models.Guest.findAll.mockResolvedValue([guest]);
    const resolved = await service.resolveGuestForInbound({
      displayPhone: "6181556489",
      chatId: "5216181556489",
    });
    expect(resolved.guest.id).toBe(guest.id);
  });
});
