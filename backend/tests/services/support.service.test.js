import { loadWithMocks, fakeUser } from "../helpers/loadWithMocks.js";
import { createInstance } from "../helpers/models.js";

describe("support.service", () => {
  let service;
  let models;

  beforeEach(async () => {
    ({ mod: service, models } = await loadWithMocks("src/services/support.service.js"));
  });

  test("serializeTicket incluye mensajes ordenados", () => {
    const json = service.serializeTicket({
      id: "t1",
      code: "T-0001",
      subject: "Ayuda",
      category: "otro",
      status: "waiting_admin",
      priority: "normal",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
      lastMessagePreview: "hola",
      user: fakeUser(),
      messages: [
        { id: "m2", body: "segundo", from: "admin", createdAt: new Date("2026-02-01"), author: { name: "Soporte" } },
        { id: "m1", body: "primero", from: "client", createdAt: new Date("2026-01-01"), author: { name: "Ana" } },
      ],
    });
    expect(json.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  test("nextTicketCode incrementa con padding", async () => {
    models.SupportTicket.count.mockResolvedValue(3);
    models.SupportTicket.findOne.mockResolvedValue(null);
    await expect(service.nextTicketCode()).resolves.toBe("T-0004");
  });

  test("addMessage rechaza cuerpo vacío", async () => {
    await expect(service.addMessage({ id: "t1" }, { authorId: "u1", from: "client", body: "  " })).rejects.toMatchObject({
      status: 400,
    });
  });

  test("addMessage persiste y actualiza el ticket", async () => {
    const ticket = createInstance({ id: "t1", status: "waiting_admin" });
    const message = createInstance({ id: "m1", body: "Hola equipo" });
    models.SupportMessage.create.mockResolvedValue(message);
    models.SupportMessage.findByPk.mockResolvedValue({ ...message, author: { name: "Ana" } });
    await service.addMessage(ticket, { authorId: "usr_test_1", from: "client", body: "Hola equipo" });
    expect(ticket.status).toBe("waiting_admin");
    expect(ticket.save).toHaveBeenCalled();
  });
});
