import { loadWithMocks, fakeEvent, fakeUser } from "../helpers/loadWithMocks.js";

describe("event-setup.service", () => {
  test("seedEventDefaults crea IA, plantillas, FAQs, miembro y permisos", async () => {
    const { mod, models } = await loadWithMocks("src/services/event-setup.service.js");
    await mod.seedEventDefaults(fakeEvent(), fakeUser(), "Sofía");
    expect(models.AiConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({
        followUps: expect.arrayContaining([
          expect.objectContaining({ id: "indeciso", days: 3, active: true }),
        ]),
      }),
    );
    expect(models.Template.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ category: "Seguimiento", title: "Recontacto a indecisos" })]),
    );
    expect(models.Faq.bulkCreate).toHaveBeenCalled();
    expect(models.EventMember.create).toHaveBeenCalledWith(expect.objectContaining({ role: "Administrador" }));
    expect(models.EventRolePermission.bulkCreate).toHaveBeenCalled();
  });
});
