import { jest } from "@jest/globals";
import { createMockReq, createMockRes } from "../helpers/http.js";
import { loadWithMocks, fakeEvent, fakeUser } from "../helpers/loadWithMocks.js";

describe("access.service", () => {
  let service;
  let models;

  beforeEach(async () => {
    ({ mod: service, models } = await loadWithMocks("src/services/access.service.js"));
  });

  test("userEventIds une eventos propios y como miembro", async () => {
    models.Event.findAll.mockResolvedValue([{ id: "evt_1" }]);
    models.EventMember.findAll.mockResolvedValue([{ eventId: "evt_2" }, { eventId: "evt_1" }]);
    await expect(service.userEventIds("usr_test_1")).resolves.toEqual(["evt_1", "evt_2"]);
  });

  test("requireEvent responde 404 si no hay acceso", async () => {
    models.Event.findAll.mockResolvedValue([]);
    models.EventMember.findAll.mockResolvedValue([]);
    const req = createMockReq({ params: { eventId: "missing" } });
    const res = createMockRes();
    const event = await service.requireEvent(req, res);
    expect(event).toBeNull();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("requireEvent devuelve el evento accesible", async () => {
    const event = fakeEvent();
    models.Event.findAll.mockResolvedValue([{ id: event.id }]);
    models.EventMember.findAll.mockResolvedValue([]);
    models.Event.findOne.mockResolvedValue(event);
    const req = createMockReq({ params: { eventId: event.slug } });
    const result = await service.requireEvent(req, createMockRes());
    expect(result).toBe(event);
  });

  test("hasEventPermission es true para el dueño", async () => {
    const event = fakeEvent({ ownerId: "usr_test_1" });
    const ok = await service.hasEventPermission(fakeUser({ id: "usr_test_1" }), event, "Editar evento");
    expect(ok).toBe(true);
  });

  test("hasEventPermission respeta el rol Asistente", async () => {
    const event = fakeEvent({ ownerId: "usr_owner" });
    models.EventMember.findOne.mockResolvedValue({ role: "Asistente" });
    models.EventRolePermission.findAll.mockResolvedValue([
      { permission: "Ver invitados" },
      { permission: "Ver conversaciones" },
    ]);
    const member = fakeUser({ id: "usr_member", isAdmin: false });
    await expect(service.hasEventPermission(member, event, "Editar evento")).resolves.toBe(false);
    await expect(service.hasEventPermission(member, event, "Ver invitados")).resolves.toBe(true);
  });

  test("requirePermission responde 403", async () => {
    const event = fakeEvent({ ownerId: "usr_owner" });
    models.EventMember.findOne.mockResolvedValue({ role: "Asistente" });
    models.EventRolePermission.findAll.mockResolvedValue([{ permission: "Ver invitados" }]);
    const req = createMockReq({ user: fakeUser({ id: "usr_member", isAdmin: false }) });
    const res = createMockRes();
    const ok = await service.requirePermission(req, res, event, "Gestionar equipo");
    expect(ok).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
