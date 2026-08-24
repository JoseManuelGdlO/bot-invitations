import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks, fakeEvent } from "../helpers/controller.js";
import { createInstance } from "../helpers/models.js";

describe("team.controller", () => {
  let controller;
  let models;

  beforeEach(async () => {
    ({ mod: controller, models } = await loadWithMocks("src/controllers/team.controller.js", {
      extraMocks: {
        "src/services/access.service.js": () => ({ requireEvent: jest.fn(async () => fakeEvent()) }),
      },
    }));
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

  test("deleteMember 404", async () => {
    models.EventMember.findOne.mockResolvedValue(null);
    const { res } = await callHandler(controller.deleteMember, {
      req: createMockReq({ params: { memberId: "x" } }),
    });
    expect(res.status).toHaveBeenCalledWith(404);
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
