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

test("primer evento adjunta defaults sin crear otra plantilla en Graph", async () => {
  const createMessageTemplate = jest.fn();
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        createMessageTemplate,
        uploadResumableHeader: jest.fn(),
      }),
    },
  });
  const origin = {
    id: "tpl_default",
    ownerUserId: "usr_1",
    isWabaDefault: true,
  };
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([origin]);
  models.EventWhatsappTemplate.create.mockImplementation(async (row) => row);

  const result = await mod.ensureEventWhatsappTemplates(
    fakeEvent({ id: "evt_first", ownerId: "usr_1" }),
  );

  expect(createMessageTemplate).not.toHaveBeenCalled();
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledWith({
    eventId: "evt_first",
    whatsappMessageTemplateId: "tpl_default",
    ownerUserId: "usr_1",
    slot: 1,
    isCampaign: true,
    slotMappings: {},
  });
  expect(result).toMatchObject({ attached: true, cloned: false });
});

test("evento con attach parcial completa sólo el slot faltante sin llamar a Graph", async () => {
  const createMessageTemplate = jest.fn();
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        createMessageTemplate,
        uploadResumableHeader: jest.fn(),
      }),
    },
  });
  const defaults = [
    { id: "tpl_default_1", ownerUserId: "usr_1", isWabaDefault: true },
    { id: "tpl_default_2", ownerUserId: "usr_1", isWabaDefault: true },
  ];
  const existingLink = {
    eventId: "evt_first",
    whatsappMessageTemplateId: "tpl_default_1",
    slot: 1,
    isCampaign: true,
    slotMappings: {},
  };
  models.EventWhatsappTemplate.findAll
    .mockResolvedValueOnce([existingLink])
    .mockResolvedValueOnce([existingLink]);
  models.WhatsappMessageTemplate.findAll.mockResolvedValue(defaults);
  models.EventWhatsappTemplate.create.mockImplementation(async (row) => row);

  const result = await mod.ensureEventWhatsappTemplates(
    fakeEvent({ id: "evt_first", ownerId: "usr_1" }),
  );

  expect(createMessageTemplate).not.toHaveBeenCalled();
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledTimes(1);
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledWith({
    eventId: "evt_first",
    whatsappMessageTemplateId: "tpl_default_2",
    ownerUserId: "usr_1",
    slot: 2,
    isCampaign: false,
    slotMappings: {},
  });
  expect(result).toMatchObject({
    attached: true,
    cloned: false,
    links: [existingLink, expect.objectContaining({ slot: 2 })],
  });
});

test("segundo evento clona templates ya ligados y conserva su configuración", async () => {
  const createMessageTemplate = jest.fn(async () => ({ id: "meta_clone" }));
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        createMessageTemplate,
        uploadResumableHeader: jest.fn(),
      }),
    },
  });
  const origin = {
    id: "tpl_origin",
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    language: "es_MX",
    category: "MARKETING",
    headerType: "none",
    components: [{ type: "BODY", text: "Hola {{1}}" }],
    isWabaDefault: true,
  };
  const sourceLink = {
    eventId: "evt_first",
    whatsappMessageTemplateId: origin.id,
    slot: 2,
    isCampaign: true,
    slotMappings: { 1: { type: "field", key: "nombre" } },
  };
  models.EventWhatsappTemplate.findAll
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([sourceLink]);
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([origin]);
  models.WhatsappMessageTemplate.create.mockImplementation(async (row) => ({
    ...row,
    id: "tpl_clone",
  }));
  models.EventWhatsappTemplate.create.mockImplementation(async (row) => row);

  const result = await mod.ensureEventWhatsappTemplates(
    fakeEvent({ id: "evt_second", ownerId: "usr_1" }),
  );

  expect(createMessageTemplate).toHaveBeenCalledTimes(1);
  expect(models.WhatsappMessageTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      metaTemplateId: "meta_clone",
      clonedFromId: "tpl_origin",
      isWabaDefault: false,
      status: "PENDING",
    }),
  );
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      eventId: "evt_second",
      whatsappMessageTemplateId: "tpl_clone",
      slot: 2,
      isCampaign: true,
      slotMappings: sourceLink.slotMappings,
    }),
  );
  expect(result).toMatchObject({ attached: false, cloned: true });
});

test("segunda ensure del mismo evento no repite el POST a Graph", async () => {
  const createMessageTemplate = jest.fn(async () => ({ id: "meta_clone" }));
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        createMessageTemplate,
        uploadResumableHeader: jest.fn(),
      }),
    },
  });
  const origin = {
    id: "tpl_origin",
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    language: "es_MX",
    category: "MARKETING",
    headerType: "none",
    components: [{ type: "BODY", text: "Hola {{1}}" }],
    isWabaDefault: true,
  };
  const sourceLink = {
    eventId: "evt_first",
    whatsappMessageTemplateId: origin.id,
    slot: 1,
    isCampaign: true,
    slotMappings: {},
  };
  let targetLinks = [];
  models.EventWhatsappTemplate.findAll.mockImplementation(async ({ where }) => {
    if (where.eventId === "evt_second") return targetLinks;
    return [sourceLink];
  });
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([origin]);
  models.WhatsappMessageTemplate.create.mockImplementation(async (row) => ({
    ...row,
    id: "tpl_clone",
  }));
  models.EventWhatsappTemplate.create.mockImplementation(async (row) => {
    targetLinks = [row];
    return row;
  });
  const event = fakeEvent({ id: "evt_second", ownerId: "usr_1" });

  await mod.ensureEventWhatsappTemplates(event);
  const result = await mod.ensureEventWhatsappTemplates(event);

  expect(createMessageTemplate).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({ attached: false, cloned: false, links: targetLinks });
});
