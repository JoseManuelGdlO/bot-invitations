import { jest } from "@jest/globals";
import { loadWithMocks, fakeEvent } from "../helpers/loadWithMocks.js";

test("wizard crea una HSM PENDING isWabaDefault y attach al evento más reciente", async () => {
  const createMessageTemplate = jest.fn(async () => ({ id: "meta_1" }));
  const event = fakeEvent({ id: "evt_old", ownerId: "usr_1" });
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        createMessageTemplate,
        updateMessageTemplate: jest.fn(),
        uploadResumableHeader: jest.fn(),
      }),
    },
  });
  models.Event.findOne.mockResolvedValue(event);
  models.WhatsappMessageTemplate.create.mockImplementation(async (row) => ({
    ...row,
    id: "tpl_1",
    update: jest.fn(async function u(p) { Object.assign(this, p); return this; }),
  }));
  models.EventWhatsappTemplate.create.mockImplementation(async (row) => row);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);

  const out = await mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    templates: [{
      slot: 1,
      headerType: "none",
      body: "Hola {{1}}, pases {{2}}",
      isCampaign: true,
    }],
  });

  expect(createMessageTemplate).toHaveBeenCalledTimes(1);
  const payload = createMessageTemplate.mock.calls[0][0].payload;
  expect(payload.language).toBe("es_MX");
  expect(payload.category).toBe("MARKETING");
  expect(payload.parameter_format).toBe("POSITIONAL");
  expect(models.WhatsappMessageTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      ownerUserId: "usr_1",
      wabaId: "waba_1",
      metaTemplateId: "meta_1",
      status: "PENDING",
      isWabaDefault: true,
      headerType: "none",
    }),
  );
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({ eventId: "evt_old", slot: 1, isCampaign: true }),
  );
  expect(out).toHaveLength(1);
});

test("wizard sin plantillas válidas 400", async () => {
  const { mod } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        createMessageTemplate: jest.fn(),
        updateMessageTemplate: jest.fn(),
        uploadResumableHeader: jest.fn(),
      }),
    },
  });
  await expect(mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "t",
    templates: [],
  })).rejects.toMatchObject({ status: 400 });
});
