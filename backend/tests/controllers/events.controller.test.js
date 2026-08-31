import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks, fakeEvent, fakeUser, PERMS } from "../helpers/controller.js";

describe("events.controller", () => {
  let controller;
  let models;
  let requireEvent;
  let assertCanCreateEvent;

  beforeEach(async () => {
    requireEvent = jest.fn(async () => fakeEvent());
    assertCanCreateEvent = jest.fn(async () => undefined);

    ({ mod: controller, models } = await loadWithMocks("src/controllers/events.controller.js", {
      extraMocks: {
        "src/services/access.service.js": () => ({
          requireEvent,
          userEventIds: jest.fn(async () => ["evt_1"]),
          requirePermission: jest.fn(async () => true),
          requireEventOwner: jest.fn(async () => true),
          PERMS,
        }),
        "src/services/event-setup.service.js": () => ({
          seedEventDefaults: jest.fn(async () => undefined),
        }),
        "src/services/activity.service.js": () => ({
          logActivity: jest.fn(async () => undefined),
        }),
        "src/services/plans.service.js": () => ({
          assertCanCreateEvent,
        }),
        "src/services/campaign.service.js": () => ({ findCurrentCampaign: jest.fn(async () => null) }),
      },
    }));

    // CRÍTICO: findOne debe retornar null por defecto para que uniqueSlug salga en la 1ra iteración
    models.Event.findOne.mockResolvedValue(null);
    models.Event.create.mockImplementation(async (data) => fakeEvent(data));
  });

  test("listEvents serializa por slug", async () => {
    models.Event.findAll.mockResolvedValue([fakeEvent()]);
    const { res } = await callHandler(controller.listEvents);
    expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ id: "boda-ana", name: "Boda Ana" })]);
  });

  test("createEvent 201", async () => {
    models.Event.findOne.mockResolvedValue(null);
    const createdEvent = fakeEvent({ name: "Boda Ana" });
    models.Event.create.mockResolvedValue(createdEvent);

    const { res } = await callHandler(controller.createEvent, {
      req: createMockReq({ user: fakeUser(), body: { name: "Boda Ana" } }),
    });

    expect(assertCanCreateEvent).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("createEvent propaga planError por next", async () => {
    const err = Object.assign(new Error("límite"), { status: 402, upgrade: true });
    assertCanCreateEvent.mockRejectedValue(err);
    const { res, next } = await callHandler(controller.createEvent, {
      req: createMockReq({ body: { name: "Boda" } }),
    });
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });

  test("getEvent 404 vía requireEvent", async () => {
    requireEvent.mockImplementation(async (req, res) => {
      res.status(404).json({ error: "Este evento no existe." });
      return null;
    });
    const { res } = await callHandler(controller.getEvent, {
      req: createMockReq({ params: { eventId: "x" } }),
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("updateEvent guarda campos permitidos", async () => {
    const event = fakeEvent();
    requireEvent.mockResolvedValue(event);
    const { res } = await callHandler(controller.updateEvent, {
      req: createMockReq({ params: { eventId: event.slug }, body: { venue: "Jardín" } }),
    });
    expect(event.venue).toBe("Jardín");
    expect(res.json).toHaveBeenCalled();
  });

  test("deleteEvent 403 si no es dueño", async () => {
    const requireEventOwner = jest.fn(async (_req, res) => {
      res.status(403).json({ error: "Solo el dueño del evento puede hacer esto." });
      return false;
    });
    ({ mod: controller } = await loadWithMocks("src/controllers/events.controller.js", {
      extraMocks: {
        "src/services/access.service.js": () => ({
          requireEvent: jest.fn(async () => fakeEvent()),
          userEventIds: jest.fn(async () => ["evt_1"]),
          requirePermission: jest.fn(async () => true),
          requireEventOwner,
          PERMS,
        }),
        "src/services/event-setup.service.js": () => ({ seedEventDefaults: jest.fn(async () => undefined) }),
        "src/services/activity.service.js": () => ({ logActivity: jest.fn(async () => undefined) }),
        "src/services/plans.service.js": () => ({ assertCanCreateEvent: jest.fn(async () => undefined) }),
      },
    }));
    const { res } = await callHandler(controller.deleteEvent, {
      req: createMockReq({ params: { eventId: "boda-ana" } }),
    });
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test("listGuests GET 403 sin Ver invitados", async () => {
    ({ mod: controller } = await loadWithMocks("src/controllers/events.controller.js", {
      extraMocks: {
        "src/services/access.service.js": () => ({
          requireEvent: jest.fn(async () => fakeEvent()),
          userEventIds: jest.fn(async () => ["evt_1"]),
          requirePermission: jest.fn(async (_req, res) => {
            res.status(403).json({ error: "No tienes permiso para esta acción." });
            return false;
          }),
          requireEventOwner: jest.fn(async () => true),
          PERMS,
        }),
        "src/services/event-setup.service.js": () => ({ seedEventDefaults: jest.fn(async () => undefined) }),
        "src/services/activity.service.js": () => ({ logActivity: jest.fn(async () => undefined) }),
        "src/services/plans.service.js": () => ({ assertCanCreateEvent: jest.fn(async () => undefined) }),
      },
    }));
    const { res } = await callHandler(controller.listGuests, {
      req: createMockReq({ params: { eventId: "boda-ana" } }),
    });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "No tienes permiso para esta acción." }));
  });

  test("listGuests filtra por status", async () => {
    models.Guest.findAll.mockResolvedValue([]);
    await callHandler(controller.listGuests, {
      req: createMockReq({ params: { eventId: "boda-ana" }, query: { status: "confirmado" } }),
    });
    expect(models.Guest.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "confirmado" }) }),
    );
  });
});