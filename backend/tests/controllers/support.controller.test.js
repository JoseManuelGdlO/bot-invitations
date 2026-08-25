import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks } from "../helpers/controller.js";
import { createInstance } from "../helpers/models.js";

describe("support.controller", () => {
  let controller;
  let models;
  let loadTicket;
  let addMessage;
  let nextTicketCode;
  let serializeTicket;

  beforeEach(async () => {
    loadTicket = jest.fn();
    addMessage = jest.fn(async () => undefined);
    nextTicketCode = jest.fn(async () => "T-0001");
    serializeTicket = (ticket) => ({ id: ticket.id, subject: ticket.subject, messages: ticket.messages || [] });
    ({ mod: controller, models } = await loadWithMocks("src/controllers/support.controller.js", {
      extraMocks: {
        "src/services/support.service.js": () => ({
          TICKET_CATEGORIES: ["facturacion", "cuenta", "eventos", "tecnico", "otro"],
          TICKET_PRIORITIES: ["low", "normal", "high"],
          TICKET_STATUSES: ["open", "waiting_admin", "waiting_client", "closed"],
          addMessage,
          loadTicket,
          nextTicketCode,
          serializeTicket,
        }),
      },
    }));
  });

  test("createMine 400 asunto corto", async () => {
    const { res } = await callHandler(controller.createMine, {
      req: createMockReq({ body: { subject: "hi", body: "detalle suficiente" } }),
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("createMine 201", async () => {
    const ticket = createInstance({ id: "t1", subject: "No carga el excel", userId: "usr_test_1" });
    models.SupportTicket.create.mockResolvedValue(ticket);
    loadTicket.mockResolvedValue({ ...ticket, messages: [] });
    const { res } = await callHandler(controller.createMine, {
      req: createMockReq({ body: { subject: "No carga el excel", body: "Al subir el archivo falla" } }),
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("getMine 404 de otro usuario", async () => {
    loadTicket.mockResolvedValue({ id: "t1", userId: "otro" });
    const { res } = await callHandler(controller.getMine, {
      req: createMockReq({ params: { ticketId: "t1" } }),
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("unreadAll", async () => {
    models.SupportTicket.count.mockResolvedValue(3);
    const { res } = await callHandler(controller.unreadAll);
    expect(res.json).toHaveBeenCalledWith({ count: 3 });
  });

  test("replyAny 404", async () => {
    loadTicket.mockResolvedValue(null);
    const { res } = await callHandler(controller.replyAny, {
      req: createMockReq({ params: { ticketId: "x" }, body: { body: "hola" } }),
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
