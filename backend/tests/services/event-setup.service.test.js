import { loadWithMocks, fakeEvent, fakeUser } from "../helpers/loadWithMocks.js";

describe("event-setup.service", () => {
  test("seedEventDefaults crea IA, plantillas, FAQs, miembro y permisos", async () => {
    const { mod, models } = await loadWithMocks("src/services/event-setup.service.js");
    await mod.seedEventDefaults(fakeEvent(), fakeUser(), "Sofía");
    expect(models.AiConfig.create).toHaveBeenCalled();
    expect(models.Template.bulkCreate).toHaveBeenCalled();
    expect(models.Faq.bulkCreate).toHaveBeenCalled();
    expect(models.EventMember.create).toHaveBeenCalledWith(expect.objectContaining({ role: "Administrador" }));
    expect(models.EventRolePermission.bulkCreate).toHaveBeenCalled();
  });
});
