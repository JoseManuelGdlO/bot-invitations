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

test("wizard ignora headerFile cuando headerType es none", async () => {
  const uploadResumableHeader = jest.fn(async () => "header_handle");
  const createMessageTemplate = jest.fn(async () => ({ id: "meta_1" }));
  const update = jest.fn();
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "node:fs": () => ({
        default: {
          promises: {
            mkdir: jest.fn(),
            writeFile: jest.fn(),
          },
        },
      }),
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        createMessageTemplate,
        updateMessageTemplate: jest.fn(),
        uploadResumableHeader,
      }),
    },
  });
  models.Event.findOne.mockResolvedValue(null);
  models.WhatsappMessageTemplate.create.mockImplementation(async (row) => ({
    ...row,
    id: "tpl_1",
    update,
  }));

  await mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    templates: [{
      slot: 1,
      headerType: "none",
      headerFile: {
        fileName: "invitacion.pdf",
        size: 4,
        mime: "application/pdf",
        buffer: Buffer.from("test"),
      },
      body: "Hola {{1}}, pases {{2}}",
      isCampaign: true,
    }],
  });

  expect(uploadResumableHeader).not.toHaveBeenCalled();
  expect(models.WhatsappMessageTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      headerFileName: null,
      headerMime: null,
      headerSize: null,
      headerHandle: null,
    }),
  );
  expect(update).not.toHaveBeenCalled();
});

test("wizard reintenta una vez con un nombre nuevo cuando Graph reporta duplicado", async () => {
  const createMessageTemplate = jest.fn()
    .mockRejectedValueOnce(new Error("Template already exists"))
    .mockResolvedValueOnce({ id: "meta_2" });
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
  models.Event.findOne.mockResolvedValue(null);
  models.WhatsappMessageTemplate.create.mockImplementation(async (row) => ({
    ...row,
    id: "tpl_2",
    update: jest.fn(),
  }));

  await mod.createWizardTemplates({
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

  expect(createMessageTemplate).toHaveBeenCalledTimes(2);
  expect(createMessageTemplate.mock.calls[1][0].payload.name)
    .not.toBe(createMessageTemplate.mock.calls[0][0].payload.name);
});

test("wizard no reintenta errores Graph que sólo mencionan name", async () => {
  const graphError = new Error("Invalid template name format");
  const createMessageTemplate = jest.fn().mockRejectedValue(graphError);
  const { mod } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        createMessageTemplate,
        updateMessageTemplate: jest.fn(),
        uploadResumableHeader: jest.fn(),
      }),
    },
  });

  await expect(mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    templates: [{
      slot: 1,
      headerType: "none",
      body: "Hola {{1}}, pases {{2}}",
      isCampaign: true,
    }],
  })).rejects.toBe(graphError);
  expect(createMessageTemplate).toHaveBeenCalledTimes(1);
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
