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
      {},
    );
    expect(models.Template.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ category: "Seguimiento", title: "Recontacto a indecisos" }),
        expect.objectContaining({
          category: "Primer contacto",
          greetingVar: "nombre",
          body: expect.stringContaining("Estamos confirmando asistencia para {{evento}}"),
        }),
      ]),
      {},
    );
    expect(models.Faq.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: "evt_1",
          q: "¿Tienen mesa de regalos?",
        }),
      ]),
      {},
    );
    expect(models.EventMember.create).toHaveBeenCalledWith(expect.objectContaining({ role: "Administrador" }), {});
    expect(models.EventRolePermission.bulkCreate).toHaveBeenCalled();
  });

  test("seedEventDefaults pasa transaction a los creates", async () => {
    const { mod, models } = await loadWithMocks("src/services/event-setup.service.js");
    const transaction = { id: "tx_1" };
    await mod.seedEventDefaults(fakeEvent(), fakeUser(), "Sofía", { transaction });
    expect(models.AiConfig.create).toHaveBeenCalledWith(expect.any(Object), { transaction });
    expect(models.Template.bulkCreate).toHaveBeenCalledWith(expect.any(Array), { transaction });
    expect(models.Faq.bulkCreate).toHaveBeenCalledWith(expect.any(Array), { transaction });
    expect(models.EventMember.create).toHaveBeenCalledWith(expect.any(Object), { transaction });
    expect(models.EventRolePermission.bulkCreate).toHaveBeenCalledWith(expect.any(Array), { transaction });
  });

  test("ensureAiConfig crea fila con defaults si no existe", async () => {
    const { mod, models } = await loadWithMocks("src/services/event-setup.service.js");
    const event = fakeEvent();
    const row = await mod.ensureAiConfig(event);
    expect(models.AiConfig.findOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: event.id },
        defaults: expect.objectContaining({
          eventId: event.id,
          assistantName: "Sofía",
          prompt: "",
        }),
      }),
    );
    expect(row).toEqual(expect.objectContaining({ assistantName: "Sofía", prompt: "" }));
  });

  test("ensureAiConfig pasa transaction a findOrCreate", async () => {
    const { mod, models } = await loadWithMocks("src/services/event-setup.service.js");
    const transaction = { id: "tx_1" };
    await mod.ensureAiConfig(fakeEvent(), { transaction });
    expect(models.AiConfig.findOrCreate).toHaveBeenCalledWith(expect.objectContaining({ transaction }));
  });
});
