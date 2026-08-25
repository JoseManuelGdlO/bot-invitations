import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks, fakeEvent, fakeUser, PERMS } from "../helpers/controller.js";
import { createInstance } from "../helpers/models.js";

describe("team.controller", () => {
  let controller;
  let models;
  let sendTeamInvitationEmail;

  beforeEach(async () => {
    sendTeamInvitationEmail = jest.fn(async () => ({ messageId: "mock_id" }));
    ({ mod: controller, models } = await loadWithMocks("src/controllers/team.controller.js", {
      extraMocks: {
        "src/services/access.service.js": () => ({
          requireEvent: jest.fn(async () => fakeEvent()),
          requirePermission: jest.fn(async () => true),
          PERMS,
        }),
        "src/services/email.service.js": () => ({ sendTeamInvitationEmail }),
      },
    }));
    models.EventRolePermission.findAll.mockResolvedValue([{ role: "Administrador" }, { role: "Asistente" }]);
    models.User.findOne.mockResolvedValue(null);
  });

  test("listMembers", async () => {
    models.EventMember.findAll.mockResolvedValue([
      { id: "m1", name: "Ana", email: "a@a.com", role: "Administrador", initials: "AN" },
    ]);
    const { res } = await callHandler(controller.listMembers);
    expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ name: "Ana" })]);
  });

  test("inviteMember 400 sin nombre", async () => {
    const { res } = await callHandler(controller.inviteMember, { req: createMockReq({ body: {} }) });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("inviteMember 400 sin correo", async () => {
    const { res } = await callHandler(controller.inviteMember, {
      req: createMockReq({ body: { name: "Luis" } }),
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "El correo es requerido." }));
  });

  test("inviteMember 400 rol inválido", async () => {
    const { res } = await callHandler(controller.inviteMember, {
      req: createMockReq({ body: { name: "Luis", email: "luis@test.com", role: "Chef" } }),
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "El rol no es válido para este evento." }));
  });

  test("inviteMember envía enlace a iniciar-sesion con el correo", async () => {
    const { res } = await callHandler(controller.inviteMember, {
      req: createMockReq({ body: { name: "Luis", email: "Luis@Test.com", role: "Asistente" } }),
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(sendTeamInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "luis@test.com",
        inviteLink: expect.stringContaining("/iniciar-sesion?email=luis%40test.com"),
      }),
    );
    expect(models.EventMember.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "luis@test.com", userId: null, removedAt: null }),
    );
  });

  test("inviteMember vincula userId si el usuario ya existe", async () => {
    models.User.findOne.mockResolvedValue(fakeUser({ id: "usr_existing", email: "luis@test.com" }));
    await callHandler(controller.inviteMember, {
      req: createMockReq({ body: { name: "Luis", email: "luis@test.com", role: "Asistente" } }),
    });
    expect(models.EventMember.create).toHaveBeenCalledWith(expect.objectContaining({ userId: "usr_existing" }));
  });

  test("deleteMember 404", async () => {
    models.EventMember.findOne.mockResolvedValue(null);
    const { res } = await callHandler(controller.deleteMember, {
      req: createMockReq({ params: { memberId: "x" } }),
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("deleteMember marca removedAt", async () => {
    const member = createInstance({ id: "m1", userId: "usr_other", email: "luis@test.com" });
    models.EventMember.findOne.mockResolvedValue(member);
    const { res } = await callHandler(controller.deleteMember, {
      req: createMockReq({ params: { memberId: "m1" } }),
    });
    expect(member.removedAt).toBeInstanceOf(Date);
    expect(member.save).toHaveBeenCalled();
    expect(member.destroy).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test("updatePermission", async () => {
    const perm = createInstance({ id: "p1", role: "Asistente", permission: "edit", enabled: false });
    models.EventRolePermission.findOne.mockResolvedValue(perm);
    const { res } = await callHandler(controller.updatePermission, {
      req: createMockReq({ params: { permissionId: "p1" }, body: { enabled: true } }),
    });
    expect(perm.enabled).toBe(true);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });
});

describe("team.controller sin Gestionar equipo", () => {
  let controller;

  beforeEach(async () => {
    ({ mod: controller } = await loadWithMocks("src/controllers/team.controller.js", {
      extraMocks: {
        "src/services/access.service.js": () => ({
          requireEvent: jest.fn(async () => fakeEvent()),
          requirePermission: jest.fn(async (_req, res) => {
            res.status(403).json({ error: "No tienes permiso para esta acción." });
            return false;
          }),
          PERMS,
        }),
        "src/services/email.service.js": () => ({ sendTeamInvitationEmail: jest.fn() }),
      },
    }));
  });

  test("updatePermission 403", async () => {
    const { res } = await callHandler(controller.updatePermission, {
      req: createMockReq({ params: { permissionId: "p1" }, body: { enabled: true } }),
    });
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
