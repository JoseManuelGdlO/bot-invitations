import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks, fakeEvent, fakeGuest, fakeUser, PERMS } from "../helpers/controller.js";

describe("guests.controller", () => {
  let controller;
  let models;
  let requireEvent;
  let userEventIds;
  let assertCanAddGuests;

  beforeEach(async () => {
    requireEvent = jest.fn(async () => fakeEvent());
    userEventIds = jest.fn(async () => ["evt_1"]);
    assertCanAddGuests = jest.fn(async () => undefined);

    ({ mod: controller, models } = await loadWithMocks("src/controllers/guests.controller.js", {
      extraMocks: {
        "src/services/access.service.js": () => ({
          requireEvent,
          userEventIds,
          requirePermission: jest.fn(async () => true),
          hasEventPermission: jest.fn(async () => true),
          PERMS,
        }),
        "src/services/activity.service.js": () => ({ 
          logActivity: jest.fn(async () => undefined) 
        }),
        "src/services/outbound.worker.js": () => ({ 
          enqueueJob: jest.fn(async () => undefined) 
        }),
        "src/services/plans.service.js": () => ({
          assertCanAddGuestsForEvent: assertCanAddGuests,
          assertCanSendInvitations: jest.fn(() => undefined),
        }),
        "src/services/export.service.js": () => ({
          guestsToRows: jest.fn((guests) => guests || []),
          toCsv: jest.fn(async () => Buffer.from("csv,data")),
          toPdf: jest.fn(async () => Buffer.from("%PDF-mock")),
          toXlsx: jest.fn(async () => Buffer.from("xlsx-mock")),
        }),
      },
    }));

    models.Event.findByPk.mockResolvedValue(fakeEvent());
    models.Guest.findOne.mockResolvedValue(fakeGuest());
    models.Guest.create.mockImplementation(async (data) => fakeGuest(data));
  });

  test("createGuest 400 sin teléfono", async () => {
    const { res } = await callHandler(controller.createGuest, {
      req: createMockReq({ params: { eventId: "boda-ana" }, body: { rep: "Luis" } }),
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("createGuest 201", async () => {
    const guest = fakeGuest({ rep: "Luis Pérez", phone: "5511111111", invited: 2 });
    models.Guest.create.mockResolvedValue(guest);

    const { res } = await callHandler(controller.createGuest, {
      req: createMockReq({
        user: fakeUser(),
        params: { eventId: "boda-ana" },
        body: { rep: "Luis Pérez", phone: "5511111111", invited: 2 },
      }),
    });

    expect(assertCanAddGuests).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ id: "evt_1" }), 2);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("updateGuest 404", async () => {
    models.Guest.findOne.mockResolvedValue(null);
    const { res } = await callHandler(controller.updateGuest, {
      req: createMockReq({ user: fakeUser(), params: { guestId: "missing" }, body: {} }),
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("previewImport 400 sin archivo", async () => {
    const { res } = await callHandler(controller.previewImport, {
      req: createMockReq({ params: { eventId: "boda-ana" }, file: undefined }),
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("confirmImport 400 sin mapping", async () => {
    const { res } = await callHandler(controller.confirmImport, {
      req: createMockReq({ params: { eventId: "boda-ana" }, body: {} }),
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("confirmImport reporta discarded cuando faltan nombre o teléfono", async () => {
    models.Guest.findAll.mockResolvedValue([]);
    models.Guest.create.mockImplementation(async (data) => fakeGuest(data));
    const { res } = await callHandler(controller.confirmImport, {
      req: createMockReq({
        user: fakeUser(),
        params: { eventId: "boda-ana" },
        body: {
          columns: ["Nombre", "Teléfono"],
          rows: [
            ["Luis Pérez", "5511111111"],
            ["Sin teléfono", ""],
          ],
          mapping: { Nombre: "rep", Teléfono: "phone" },
        },
      }),
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ imported: 1, skipped: 0, discarded: 1 }),
    );
  });

  test("exportGuests csv llama send", async () => {
    models.Guest.findAll.mockResolvedValue([fakeGuest()]);
    const { res } = await callHandler(controller.exportGuests, {
      req: createMockReq({ params: { eventId: "boda-ana" }, query: { format: "csv" } }),
    });
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", expect.stringContaining("csv"));
    expect(res.send).toHaveBeenCalled();
  });

  test("deleteGuest 404", async () => {
    models.Guest.findOne.mockResolvedValue(null);
    const { res } = await callHandler(controller.deleteGuest, {
      req: createMockReq({ user: fakeUser(), params: { guestId: "missing" } }),
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("deleteGuest ok", async () => {
    const guest = fakeGuest();
    guest.destroy = jest.fn(async () => guest);
    models.Guest.findOne.mockResolvedValue(guest);
    models.Conversation.findOne.mockResolvedValue({ id: "conv_1" });
    const { res } = await callHandler(controller.deleteGuest, {
      req: createMockReq({ user: fakeUser(), params: { guestId: "gst_1" } }),
    });
    expect(models.Message.destroy).toHaveBeenCalled();
    expect(guest.destroy).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});

describe("guests.controller Asistente", () => {
  let controller;
  let models;

  beforeEach(async () => {
    ({ mod: controller, models } = await loadWithMocks("src/controllers/guests.controller.js", {
      extraMocks: {
        "src/services/access.service.js": () => ({
          requireEvent: jest.fn(async () => fakeEvent()),
          userEventIds: jest.fn(async () => ["evt_1"]),
          requirePermission: jest.fn(async (_req, res) => {
            res.status(403).json({ error: "No tienes permiso para esta acción." });
            return false;
          }),
          hasEventPermission: jest.fn(async () => false),
          PERMS,
        }),
        "src/services/activity.service.js": () => ({ logActivity: jest.fn(async () => undefined) }),
        "src/services/outbound.worker.js": () => ({ enqueueJob: jest.fn(async () => undefined) }),
        "src/services/plans.service.js": () => ({
          assertCanAddGuestsForEvent: jest.fn(async () => undefined),
          assertCanSendInvitations: jest.fn(() => undefined),
        }),
        "src/services/export.service.js": () => ({
          guestsToRows: jest.fn((guests) => guests || []),
          toCsv: jest.fn(async () => Buffer.from("csv,data")),
          toPdf: jest.fn(async () => Buffer.from("%PDF-mock")),
          toXlsx: jest.fn(async () => Buffer.from("xlsx-mock")),
        }),
      },
    }));
    models.Event.findByPk.mockResolvedValue(fakeEvent());
    models.Guest.findOne.mockResolvedValue(fakeGuest());
  });

  test("updateGuest 403 sin permisos de edición", async () => {
    const { res } = await callHandler(controller.updateGuest, {
      req: createMockReq({ user: fakeUser(), params: { guestId: "gst_1" }, body: { phone: "5511111111" } }),
    });
    expect(res.status).toHaveBeenCalledWith(403);
  });
});