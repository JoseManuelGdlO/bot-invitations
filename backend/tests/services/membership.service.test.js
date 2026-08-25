import { loadWithMocks, fakeUser } from "../helpers/loadWithMocks.js";

describe("membership.service", () => {
  let service;
  let models;

  beforeEach(async () => {
    ({ mod: service, models } = await loadWithMocks("src/services/membership.service.js"));
  });

  test("normalizeEmail recorta y pone minúsculas", () => {
    expect(service.normalizeEmail("  Ana@Test.com ")).toBe("ana@test.com");
  });

  test("claimPendingInvitations actualiza miembros sin userId", async () => {
    const user = fakeUser({ id: "usr_new", email: "luis@test.com" });
    models.EventMember.update.mockResolvedValue([2]);
    await expect(service.claimPendingInvitations(user)).resolves.toBe(2);
    expect(models.EventMember.update).toHaveBeenCalledWith(
      { userId: "usr_new" },
      { where: { userId: null, email: "luis@test.com" } },
    );
  });

  test("findPendingInvitations busca por email", async () => {
    models.EventMember.findAll.mockResolvedValue([{ id: "m1" }]);
    const rows = await service.findPendingInvitations("Luis@Test.com");
    expect(rows).toHaveLength(1);
    expect(models.EventMember.findAll).toHaveBeenCalledWith({
      where: { userId: null, email: "luis@test.com" },
    });
  });
});
