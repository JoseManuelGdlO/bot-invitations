import { jest } from "@jest/globals";
import {
  loadWithMocks,
  fakeEvent,
  fakeGuest,
} from "../helpers/loadWithMocks.js";

function ownerMetaMocks(wabaId = "waba_1") {
  return {
    "src/services/whatsapp-meta.service.js": () => ({
      resolveActiveWhatsappMetaByOwner: jest.fn(async () => ({
        credentials: { wabaId, accessToken: "tok", phoneNumberId: "1" },
      })),
    }),
  };
}

function hsmRow(overrides = {}) {
  const row = {
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    language: "es_MX",
    category: "MARKETING",
    headerType: "none",
    isWabaDefault: false,
    clonedFromId: null,
    update: jest.fn(async function update(patch) {
      Object.assign(this, patch);
      return this;
    }),
    ...overrides,
  };
  return row;
}

const WIZARD_BODY =
  "Hola {{1}}, tienes {{2}} pases reservados. Confirma por este chat, por favor.";
const WIZARD_BODY_EXTRA =
  "Hola {{1}}, te invitamos a {{3}}. Reservamos {{2}} pases a tu nombre. Te esperamos el {{4}} en {{5}}. Confirma tu asistencia respondiendo este mensaje, por favor.";
const WIZARD_BODY_UPDATED =
  "Hola {{1}}, te escribimos para invitarte con mucho gusto a nuestra celebración. Reservamos {{2}} pases a tu nombre. Confírmanos tu asistencia por este chat cuando puedas, por favor.";
const LOCKED_MAPPINGS = {
  "1": { type: "field", key: "nombre" },
  "2": { type: "field", key: "numero_invitados" },
};

async function loadWizardService(graph = {}) {
  const createMessageTemplate = graph.createMessageTemplate
    || jest.fn(async () => ({ id: "meta_1" }));
  const updateMessageTemplate = graph.updateMessageTemplate || jest.fn();
  const uploadResumableHeader = graph.uploadResumableHeader || jest.fn();
  const resolveTemplateCrudToken = graph.resolveTemplateCrudToken
    || jest.fn((token) => token);
  const ensurePlatformCanManageWaba = graph.ensurePlatformCanManageWaba
    || jest.fn();
  const deleteMessageTemplate = graph.deleteMessageTemplate
    || jest.fn(async () => ({ success: true }));
  const extraMocks = {
    "src/services/meta-graph.client.js": () => ({
      resolveTemplateCrudToken,
      ensurePlatformCanManageWaba,
      createMessageTemplate,
      updateMessageTemplate,
      uploadResumableHeader,
      deleteMessageTemplate,
    }),
  };
  if (graph.mockFs) {
    extraMocks["node:fs"] = () => ({
      default: {
        promises: {
          mkdir: jest.fn(),
          writeFile: jest.fn(),
        },
      },
    });
  }
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks,
  });
  models.WhatsappMessageTemplate.create.mockImplementation(async (row) => ({
    ...row,
    id: "tpl_1",
    update: jest.fn(async function update(patch) {
      Object.assign(this, patch);
      return this;
    }),
  }));
  models.EventWhatsappTemplate.create.mockImplementation(async (row) => row);
  return {
    mod,
    models,
    createMessageTemplate,
    updateMessageTemplate,
    uploadResumableHeader,
    deleteMessageTemplate,
    resolveTemplateCrudToken,
    ensurePlatformCanManageWaba,
  };
}

async function loadEventCustomService(graph = {}) {
  const createMessageTemplate = graph.createMessageTemplate
    || jest.fn(async () => ({ id: "meta_custom" }));
  const updateMessageTemplate = graph.updateMessageTemplate || jest.fn();
  const uploadResumableHeader = graph.uploadResumableHeader || jest.fn();
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      ...ownerMetaMocks(),
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: graph.resolveTemplateCrudToken || ((token) => token || "tok"),
        ensurePlatformCanManageWaba: jest.fn(),
        createMessageTemplate,
        updateMessageTemplate,
        uploadResumableHeader,
        deleteMessageTemplate: jest.fn(),
      }),
    },
  });
  models.Event.findOne.mockResolvedValue(fakeEvent({ id: "evt_1", ownerId: "usr_1" }));
  models.WhatsappMessageTemplate.create.mockImplementation(async (row) => ({
    ...row,
    id: "tpl_custom",
    update: jest.fn(async function update(patch) {
      Object.assign(this, patch);
      return this;
    }),
  }));
  models.EventWhatsappTemplate.create.mockImplementation(async (row) => ({
    ...row,
    id: "link_custom",
  }));
  return { mod, models, createMessageTemplate, updateMessageTemplate, uploadResumableHeader };
}

const CUSTOM_EXTRA_BODY =
  "Hola {{1}}, tienes {{2}} pases reservados. Tu mesa es la {{3}}. Confirma por este chat, por favor.";
const CUSTOM_EXTRA_MAPPINGS = {
  ...LOCKED_MAPPINGS,
  "3": { type: "field", key: "mesa" },
};

async function loadLibraryService(graph = {}) {
  const deleteMessageTemplate = graph.deleteMessageTemplate
    || jest.fn(async () => ({ success: true }));
  const resolveTemplateCrudToken = graph.resolveTemplateCrudToken
    || jest.fn((token) => token || "tok");
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken,
        ensurePlatformCanManageWaba: jest.fn(),
        createMessageTemplate: graph.createMessageTemplate || jest.fn(),
        updateMessageTemplate: graph.updateMessageTemplate || jest.fn(),
        uploadResumableHeader: graph.uploadResumableHeader || jest.fn(),
        deleteMessageTemplate,
      }),
      ...ownerMetaMocks(),
    },
  });
  return { mod, models, deleteMessageTemplate, resolveTemplateCrudToken };
}

function libraryTemplate(overrides = {}) {
  return hsmRow({
    id: "tpl_1",
    name: "alanna_pc_ab12cd34_1",
    metaTemplateId: "meta_tpl_1",
    status: "APPROVED",
    headerType: "none",
    isWabaDefault: false,
    components: [{ type: "BODY", text: WIZARD_BODY }],
    createdAt: new Date("2026-01-02"),
    destroy: jest.fn(async function destroy() {
      return this;
    }),
    ...overrides,
  });
}

function existingDefault(overrides = {}) {
  return {
    id: "tpl_existing",
    metaTemplateId: "meta_existing",
    name: "alanna_pc_aaaa1111_1",
    status: "PENDING",
    isWabaDefault: true,
    headerType: "none",
    language: "es_MX",
    category: "MARKETING",
    wabaId: "waba_1",
    components: [{
      type: "BODY",
      text: WIZARD_BODY,
      example: { body_text: [["María", "2"]] },
    }],
    update: jest.fn(async function update(patch) {
      Object.assign(this, patch);
      return this;
    }),
    ...overrides,
  };
}

test("wizard crea una HSM PENDING isWabaDefault y attach a todos los eventos del owner", async () => {
  const {
    mod,
    models,
    createMessageTemplate,
    resolveTemplateCrudToken,
    ensurePlatformCanManageWaba,
  } = await loadWizardService({
    ensurePlatformCanManageWaba: jest.fn(async () => ({ shared: false, assigned: false })),
  });
  models.Event.findAll.mockResolvedValue([
    fakeEvent({ id: "evt_old", ownerId: "usr_1" }),
    fakeEvent({ id: "evt_new", ownerId: "usr_1" }),
  ]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);

  const out = await mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    displayName: "Invitación formal",
    headerType: "none",
    body: WIZARD_BODY,
    slotMappings: LOCKED_MAPPINGS,
  });

  expect(resolveTemplateCrudToken).toHaveBeenCalledWith("planner");
  expect(createMessageTemplate).toHaveBeenCalledTimes(1);
  expect(createMessageTemplate).toHaveBeenCalledWith(expect.objectContaining({ token: "planner" }));
  expect(ensurePlatformCanManageWaba).not.toHaveBeenCalled();
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
  const created = models.WhatsappMessageTemplate.create.mock.calls[0][0];
  expect(created.displayName).toBe("Invitación formal");
  expect(payload).not.toHaveProperty("displayName");
  expect(models.Event.findOne).not.toHaveBeenCalled();
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledTimes(2);
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      eventId: "evt_old",
      slot: 1,
      isCampaign: true,
      whatsappMessageTemplateId: "tpl_1",
      slotMappings: LOCKED_MAPPINGS,
    }),
  );
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      eventId: "evt_new",
      slot: 1,
      isCampaign: true,
      whatsappMessageTemplateId: "tpl_1",
    }),
  );
  expect(out.template).toMatchObject({ id: "tpl_1", isWabaDefault: true, status: "PENDING" });
  expect(out.slotMappings).toEqual(LOCKED_MAPPINGS);
});

test("wizard actualiza en Meta si ya hay default y el body o header cambiaron", async () => {
  const updateMessageTemplate = jest.fn(async () => ({ success: true }));
  const uploadResumableHeader = jest.fn(async () => "header_handle");
  const { mod, models, createMessageTemplate } = await loadWizardService({
    updateMessageTemplate,
    uploadResumableHeader,
    mockFs: true,
  });
  const existing = existingDefault({ status: "APPROVED" });
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([existing]);
  models.Event.findAll.mockResolvedValue([fakeEvent({ id: "evt_1", ownerId: "usr_1" })]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);

  const out = await mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    headerType: "document",
    headerFile: {
      buffer: Buffer.from("pdf"),
      fileName: "invitacion.pdf",
      mime: "application/pdf",
      size: 3,
    },
    body: WIZARD_BODY_UPDATED,
    slotMappings: LOCKED_MAPPINGS,
  });

  expect(createMessageTemplate).not.toHaveBeenCalled();
  expect(models.WhatsappMessageTemplate.create).not.toHaveBeenCalled();
  expect(uploadResumableHeader).toHaveBeenCalled();
  expect(updateMessageTemplate).toHaveBeenCalledWith({
    templateId: "meta_existing",
    token: "planner",
    payload: expect.objectContaining({
      language: "es_MX",
      category: "MARKETING",
      components: expect.any(Array),
    }),
  });
  expect(existing.update).toHaveBeenCalledWith(expect.objectContaining({
    status: "PENDING",
    headerType: "document",
    components: expect.any(Array),
  }));
  expect(out.template.status).toBe("PENDING");
});

test("wizard no llama a Graph si ya hay default con el mismo body y header", async () => {
  const { mod, models, createMessageTemplate, updateMessageTemplate, uploadResumableHeader } =
    await loadWizardService();
  const existing = existingDefault();
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([existing]);
  models.Event.findAll.mockResolvedValue([
    fakeEvent({ id: "evt_a", ownerId: "usr_1" }),
    fakeEvent({ id: "evt_b", ownerId: "usr_1" }),
  ]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);

  const out = await mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    headerType: "none",
    body: WIZARD_BODY,
    slotMappings: LOCKED_MAPPINGS,
  });

  expect(createMessageTemplate).not.toHaveBeenCalled();
  expect(updateMessageTemplate).not.toHaveBeenCalled();
  expect(uploadResumableHeader).not.toHaveBeenCalled();
  expect(models.WhatsappMessageTemplate.create).not.toHaveBeenCalled();
  expect(existing.update).not.toHaveBeenCalled();
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledTimes(2);
  expect(models.EventWhatsappTemplate.update).toHaveBeenCalledWith(
    { slotMappings: LOCKED_MAPPINGS },
    { where: { whatsappMessageTemplateId: existing.id } },
  );
  expect(out.template).toBe(existing);
});

test("wizard persiste displayName al actualizar el default en Meta", async () => {
  const updateMessageTemplate = jest.fn(async () => ({ success: true }));
  const { mod, models, createMessageTemplate } = await loadWizardService({
    updateMessageTemplate,
  });
  const existing = existingDefault({ status: "APPROVED", displayName: "Viejo" });
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([existing]);
  models.Event.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);

  await mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    displayName: "  Nuevo nombre  ",
    headerType: "none",
    body: WIZARD_BODY_UPDATED,
    slotMappings: LOCKED_MAPPINGS,
  });

  expect(createMessageTemplate).not.toHaveBeenCalled();
  expect(existing.update).toHaveBeenCalledWith(expect.objectContaining({
    displayName: "Nuevo nombre",
  }));
  expect(updateMessageTemplate.mock.calls[0][0].payload).not.toHaveProperty("displayName");
});

test("wizard persiste displayName aunque el body y header no cambien", async () => {
  const { mod, models, createMessageTemplate, updateMessageTemplate } = await loadWizardService();
  const existing = existingDefault({ displayName: null });
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([existing]);
  models.Event.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);

  await mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    displayName: "Invitación formal",
    headerType: "none",
    body: WIZARD_BODY,
    slotMappings: LOCKED_MAPPINGS,
  });

  expect(createMessageTemplate).not.toHaveBeenCalled();
  expect(updateMessageTemplate).not.toHaveBeenCalled();
  expect(models.WhatsappMessageTemplate.create).not.toHaveBeenCalled();
  expect(existing.update).toHaveBeenCalledWith({ displayName: "Invitación formal" });
});

test("wizard recorta displayName a 120 caracteres", async () => {
  const { mod, models } = await loadWizardService();
  models.Event.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);
  const longName = `N${"x".repeat(130)}`;

  await mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    displayName: longName,
    headerType: "none",
    body: WIZARD_BODY,
    slotMappings: LOCKED_MAPPINGS,
  });

  const created = models.WhatsappMessageTemplate.create.mock.calls[0][0];
  expect(created.displayName).toHaveLength(120);
  expect(created.displayName).toBe(longName.slice(0, 120));
});

test("wizard guarda displayName null si viene vacío", async () => {
  const { mod, models } = await loadWizardService();
  models.Event.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);

  await mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    displayName: "   ",
    headerType: "none",
    body: WIZARD_BODY,
    slotMappings: LOCKED_MAPPINGS,
  });

  expect(models.WhatsappMessageTemplate.create.mock.calls[0][0].displayName).toBeNull();
});

test("wizard actualiza en Meta si el body es igual pero cambian los slotMappings", async () => {
  const updateMessageTemplate = jest.fn(async () => ({}));
  const { mod, models, createMessageTemplate } = await loadWizardService({
    updateMessageTemplate,
  });
  const extraMappings = {
    ...LOCKED_MAPPINGS,
    "3": { type: "field", key: "evento" },
    "4": { type: "field", key: "fecha" },
    "5": { type: "field", key: "lugar" },
  };
  const existing = existingDefault({
    components: [{
      type: "BODY",
      text: WIZARD_BODY_EXTRA,
      example: { body_text: [["María", "2", "evento", "fecha", "lugar"]] },
    }],
  });
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([existing]);
  models.Event.findAll.mockResolvedValue([fakeEvent({ id: "evt_1", ownerId: "usr_1" })]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);

  await mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    headerType: "none",
    body: WIZARD_BODY_EXTRA,
    slotMappings: {
      ...extraMappings,
      "3": { type: "field", key: "planner" },
    },
  });

  expect(createMessageTemplate).not.toHaveBeenCalled();
  expect(updateMessageTemplate).toHaveBeenCalled();
  expect(existing.update).toHaveBeenCalled();
});

test("wizard adjunta el default a 3 eventos sin campaña con una sola HSM", async () => {
  const { mod, models, createMessageTemplate } = await loadWizardService();
  models.Event.findAll.mockResolvedValue([
    fakeEvent({ id: "evt_1", ownerId: "usr_1" }),
    fakeEvent({ id: "evt_2", ownerId: "usr_1" }),
    fakeEvent({ id: "evt_3", ownerId: "usr_1" }),
  ]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);

  await mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    headerType: "none",
    body: WIZARD_BODY,
    slotMappings: LOCKED_MAPPINGS,
  });

  expect(createMessageTemplate).toHaveBeenCalledTimes(1);
  expect(models.WhatsappMessageTemplate.create).toHaveBeenCalledTimes(1);
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledTimes(3);
  for (const eventId of ["evt_1", "evt_2", "evt_3"]) {
    expect(models.EventWhatsappTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId,
        whatsappMessageTemplateId: "tpl_1",
        isCampaign: true,
        slot: 1,
        slotMappings: LOCKED_MAPPINGS,
      }),
    );
  }
});

test("wizard no pisa un vínculo de campaña personalizado y sí adjunta a los demás eventos", async () => {
  const { mod, models, createMessageTemplate } = await loadWizardService();
  models.Event.findAll.mockResolvedValue([
    fakeEvent({ id: "evt_custom", ownerId: "usr_1" }),
    fakeEvent({ id: "evt_bare", ownerId: "usr_1" }),
    fakeEvent({ id: "evt_slots", ownerId: "usr_1" }),
  ]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([
    {
      eventId: "evt_custom",
      slot: 1,
      isCampaign: true,
      whatsappMessageTemplateId: "tpl_custom",
    },
    {
      eventId: "evt_slots",
      slot: 1,
      isCampaign: false,
      whatsappMessageTemplateId: "tpl_other",
    },
  ]);

  await mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    headerType: "none",
    body: WIZARD_BODY,
    slotMappings: LOCKED_MAPPINGS,
  });

  expect(createMessageTemplate).toHaveBeenCalledTimes(1);
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledTimes(2);
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      eventId: "evt_bare",
      slot: 1,
      isCampaign: true,
      whatsappMessageTemplateId: "tpl_1",
    }),
  );
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      eventId: "evt_slots",
      slot: 2,
      isCampaign: true,
      whatsappMessageTemplateId: "tpl_1",
    }),
  );
  expect(models.EventWhatsappTemplate.create).not.toHaveBeenCalledWith(
    expect.objectContaining({ eventId: "evt_custom" }),
  );
});

test("wizard refresca slotMappings de pivots del default y no toca forks", async () => {
  const extraMappings = {
    ...LOCKED_MAPPINGS,
    "3": { type: "field", key: "evento" },
    "4": { type: "field", key: "fecha" },
    "5": { type: "field", key: "lugar" },
  };
  const updateMessageTemplate = jest.fn(async () => ({ success: true }));
  const { mod, models } = await loadWizardService({ updateMessageTemplate });
  const existing = existingDefault({ status: "APPROVED" });
  const campaignPivot = {
    eventId: "evt_campaign",
    slot: 1,
    isCampaign: true,
    whatsappMessageTemplateId: existing.id,
    slotMappings: LOCKED_MAPPINGS,
  };
  const forkPivot = {
    eventId: "evt_fork",
    slot: 1,
    isCampaign: true,
    whatsappMessageTemplateId: "tpl_fork",
    slotMappings: LOCKED_MAPPINGS,
    update: jest.fn(),
  };
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([existing]);
  models.Event.findAll.mockResolvedValue([
    fakeEvent({ id: "evt_campaign", ownerId: "usr_1" }),
    fakeEvent({ id: "evt_fork", ownerId: "usr_1" }),
    fakeEvent({ id: "evt_bare", ownerId: "usr_1" }),
  ]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([campaignPivot, forkPivot]);

  const out = await mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    headerType: "none",
    body: WIZARD_BODY_EXTRA,
    slotMappings: extraMappings,
  });

  expect(out.template.id).toBe(existing.id);
  expect(models.EventWhatsappTemplate.update).toHaveBeenCalledWith(
    { slotMappings: extraMappings },
    { where: { whatsappMessageTemplateId: existing.id } },
  );
  expect(models.EventWhatsappTemplate.update).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ where: { whatsappMessageTemplateId: "tpl_fork" } }),
  );
  expect(forkPivot.update).not.toHaveBeenCalled();
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledTimes(1);
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      eventId: "evt_bare",
      whatsappMessageTemplateId: existing.id,
      isCampaign: true,
      slot: 1,
      slotMappings: extraMappings,
    }),
  );
  expect(models.EventWhatsappTemplate.create).not.toHaveBeenCalledWith(
    expect.objectContaining({ eventId: "evt_campaign" }),
  );
  expect(models.EventWhatsappTemplate.create).not.toHaveBeenCalledWith(
    expect.objectContaining({ eventId: "evt_fork" }),
  );
});

test("wizard edita el default con más pivots de campaña aunque sea más nuevo", async () => {
  const updateMessageTemplate = jest.fn(async () => ({ success: true }));
  const { mod, models, createMessageTemplate } = await loadWizardService({
    updateMessageTemplate,
  });
  const older = existingDefault({
    id: "tpl_old",
    metaTemplateId: "meta_old",
    name: "alanna_pc_aaaa1111_1",
    status: "APPROVED",
    createdAt: new Date("2026-01-01"),
  });
  const newer = existingDefault({
    id: "tpl_new",
    metaTemplateId: "meta_new",
    name: "alanna_pc_bbbb2222_2",
    status: "APPROVED",
    createdAt: new Date("2026-06-01"),
  });
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([older, newer]);
  models.EventWhatsappTemplate.count.mockImplementation(async ({ where } = {}) => {
    if (where?.whatsappMessageTemplateId === "tpl_new") return 3;
    if (where?.whatsappMessageTemplateId === "tpl_old") return 1;
    return 0;
  });
  models.Event.findAll.mockResolvedValue([]);

  await mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    headerType: "none",
    body: WIZARD_BODY_UPDATED,
    slotMappings: LOCKED_MAPPINGS,
  });

  expect(createMessageTemplate).not.toHaveBeenCalled();
  expect(updateMessageTemplate).toHaveBeenCalledWith(
    expect.objectContaining({ templateId: "meta_new" }),
  );
  expect(newer.update).toHaveBeenCalled();
  expect(older.update).not.toHaveBeenCalled();
});

test("wizard desempata defaults con el mismo uso de campaña eligiendo el más antiguo", async () => {
  const updateMessageTemplate = jest.fn(async () => ({ success: true }));
  const { mod, models } = await loadWizardService({ updateMessageTemplate });
  const older = existingDefault({
    id: "tpl_old",
    metaTemplateId: "meta_old",
    name: "alanna_pc_aaaa1111_1",
    status: "APPROVED",
    createdAt: new Date("2026-01-01"),
  });
  const newer = existingDefault({
    id: "tpl_new",
    metaTemplateId: "meta_new",
    name: "alanna_pc_bbbb2222_2",
    status: "APPROVED",
    createdAt: new Date("2026-06-01"),
  });
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([older, newer]);
  models.EventWhatsappTemplate.count.mockResolvedValue(2);
  models.Event.findAll.mockResolvedValue([]);

  await mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    headerType: "none",
    body: WIZARD_BODY_UPDATED,
    slotMappings: LOCKED_MAPPINGS,
  });

  expect(updateMessageTemplate).toHaveBeenCalledWith(
    expect.objectContaining({ templateId: "meta_old" }),
  );
  expect(older.update).toHaveBeenCalled();
  expect(newer.update).not.toHaveBeenCalled();
});

test("wizard admite variables extra mapeadas a campos universales", async () => {
  const extraMappings = {
    ...LOCKED_MAPPINGS,
    "3": { type: "field", key: "evento" },
    "4": { type: "field", key: "fecha" },
    "5": { type: "field", key: "lugar" },
  };
  const { mod, models } = await loadWizardService();
  models.Event.findAll.mockResolvedValue([fakeEvent({ id: "evt_1", ownerId: "usr_1" })]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);

  const out = await mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    headerType: "none",
    body: WIZARD_BODY_EXTRA,
    slotMappings: extraMappings,
  });

  expect(models.WhatsappMessageTemplate.create).toHaveBeenCalled();
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({ slotMappings: extraMappings }),
  );
  expect(out.slotMappings).toEqual(extraMappings);
});

test("wizard rechaza extras mapeados a literales o customData", async () => {
  const { mod, createMessageTemplate } = await loadWizardService();

  await expect(mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    headerType: "none",
    body: WIZARD_BODY_EXTRA,
    slotMappings: {
      ...LOCKED_MAPPINGS,
      "3": { type: "literal", value: "Boda Ana" },
      "4": { type: "field", key: "fecha" },
      "5": { type: "field", key: "lugar" },
    },
  })).rejects.toMatchObject({
    status: 400,
    message: expect.stringMatching(/universales/i),
  });

  await expect(mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    headerType: "none",
    body: WIZARD_BODY_EXTRA,
    slotMappings: {
      ...LOCKED_MAPPINGS,
      "3": { type: "field", key: "mesa" },
      "4": { type: "field", key: "fecha" },
      "5": { type: "field", key: "lugar" },
    },
  })).rejects.toMatchObject({
    status: 400,
    message: expect.stringMatching(/universales/i),
  });

  expect(createMessageTemplate).not.toHaveBeenCalled();
});

test("wizard conserva la fila local si Graph rechaza el update", async () => {
  const graphError = Object.assign(new Error("Meta no pudo actualizar la plantilla."), {
    status: 502,
  });
  const updateMessageTemplate = jest.fn().mockRejectedValue(graphError);
  const { mod, models } = await loadWizardService({ updateMessageTemplate });
  const existing = existingDefault({ status: "APPROVED" });
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([existing]);
  models.Event.findAll.mockResolvedValue([fakeEvent({ id: "evt_1", ownerId: "usr_1" })]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);

  await expect(mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    headerType: "none",
    body: WIZARD_BODY_UPDATED,
    slotMappings: LOCKED_MAPPINGS,
  })).rejects.toBe(graphError);

  expect(existing.status).toBe("APPROVED");
  expect(existing.update).not.toHaveBeenCalled();
  expect(models.EventWhatsappTemplate.create).not.toHaveBeenCalled();
});

test("wizard acepta templates[] de un item como payload de compatibilidad", async () => {
  const { mod, models, createMessageTemplate } = await loadWizardService();
  models.Event.findAll.mockResolvedValue([
    fakeEvent({ id: "evt_1", ownerId: "usr_1" }),
    fakeEvent({ id: "evt_2", ownerId: "usr_1" }),
  ]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);

  const out = await mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    templates: [{
      slot: 1,
      headerType: "none",
      body: WIZARD_BODY,
      isCampaign: true,
      slotMappings: LOCKED_MAPPINGS,
    }],
  });

  expect(createMessageTemplate).toHaveBeenCalledTimes(1);
  expect(Array.isArray(out)).toBe(false);
  expect(out.template).toMatchObject({ id: "tpl_1", isWabaDefault: true });
  expect(models.Event.findOne).not.toHaveBeenCalled();
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledTimes(2);
});

test("wizard ignora headerFile cuando headerType es none", async () => {
  const uploadResumableHeader = jest.fn(async () => "header_handle");
  const { mod, models, createMessageTemplate } = await loadWizardService({
    uploadResumableHeader,
    mockFs: true,
    resolveTemplateCrudToken: () => "sys_tok",
  });

  await mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    headerType: "none",
    headerFile: {
      fileName: "invitacion.pdf",
      size: 4,
      mime: "application/pdf",
      buffer: Buffer.from("test"),
    },
    body: WIZARD_BODY,
    slotMappings: LOCKED_MAPPINGS,
  });

  expect(createMessageTemplate).toHaveBeenCalledTimes(1);
  expect(uploadResumableHeader).not.toHaveBeenCalled();
  expect(models.WhatsappMessageTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      headerFileName: null,
      headerMime: null,
      headerSize: null,
      headerHandle: null,
    }),
  );
});

test("wizard reintenta una vez con un nombre nuevo cuando Graph reporta duplicado", async () => {
  const createMessageTemplate = jest.fn()
    .mockRejectedValueOnce(new Error("Template already exists"))
    .mockResolvedValueOnce({ id: "meta_2" });
  const { mod } = await loadWizardService({
    createMessageTemplate,
    resolveTemplateCrudToken: () => "sys_tok",
  });

  await mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    headerType: "none",
    body: WIZARD_BODY,
    slotMappings: LOCKED_MAPPINGS,
  });

  expect(createMessageTemplate).toHaveBeenCalledTimes(2);
  expect(createMessageTemplate.mock.calls[1][0].payload.name)
    .not.toBe(createMessageTemplate.mock.calls[0][0].payload.name);
});

test("wizard no reintenta errores Graph que sólo mencionan name", async () => {
  const graphError = new Error("Invalid template name format");
  const createMessageTemplate = jest.fn().mockRejectedValue(graphError);
  const { mod } = await loadWizardService({
    createMessageTemplate,
    resolveTemplateCrudToken: () => "sys_tok",
  });

  await expect(mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    headerType: "none",
    body: WIZARD_BODY,
    slotMappings: LOCKED_MAPPINGS,
  })).rejects.toBe(graphError);
  expect(createMessageTemplate).toHaveBeenCalledTimes(1);
});

test("wizard sin plantillas válidas 400", async () => {
  const { mod } = await loadWizardService();
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
        ensurePlatformCanManageWaba: jest.fn(async () => ({ shared: true, assigned: true })),
        createMessageTemplate,
        updateMessageTemplate: jest.fn(),
        uploadResumableHeader: jest.fn(),
        deleteMessageTemplate: jest.fn(),
      }),
      ...ownerMetaMocks(),
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
        ensurePlatformCanManageWaba: jest.fn(async () => ({ shared: true, assigned: true })),
        createMessageTemplate,
        updateMessageTemplate: jest.fn(),
        uploadResumableHeader: jest.fn(),
        deleteMessageTemplate: jest.fn(),
      }),
      ...ownerMetaMocks(),
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

test("evento con sólo default 2 en slot 2 adjunta default 1 en slot 1 sin llamar a Graph", async () => {
  const createMessageTemplate = jest.fn();
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        ensurePlatformCanManageWaba: jest.fn(async () => ({ shared: true, assigned: true })),
        createMessageTemplate,
        updateMessageTemplate: jest.fn(),
        uploadResumableHeader: jest.fn(),
        deleteMessageTemplate: jest.fn(),
      }),
      ...ownerMetaMocks(),
    },
  });
  const defaults = [
    { id: "tpl_default_1", ownerUserId: "usr_1", isWabaDefault: true },
    { id: "tpl_default_2", ownerUserId: "usr_1", isWabaDefault: true },
  ];
  const existingLink = {
    eventId: "evt_first",
    whatsappMessageTemplateId: "tpl_default_2",
    slot: 2,
    isCampaign: false,
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
    whatsappMessageTemplateId: "tpl_default_1",
    ownerUserId: "usr_1",
    slot: 1,
    isCampaign: true,
    slotMappings: {},
  });
  expect(result).toMatchObject({
    attached: true,
    cloned: false,
    links: [existingLink, expect.objectContaining({
      whatsappMessageTemplateId: "tpl_default_1",
      slot: 1,
    })],
  });
});

test("segundo evento adjunta el mismo tpl_origin sin createMessageTemplate", async () => {
  const createMessageTemplate = jest.fn(async () => ({ id: "meta_clone" }));
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        ensurePlatformCanManageWaba: jest.fn(async () => ({ shared: true, assigned: true })),
        createMessageTemplate,
        updateMessageTemplate: jest.fn(),
        uploadResumableHeader: jest.fn(),
        deleteMessageTemplate: jest.fn(),
      }),
      ...ownerMetaMocks(),
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
  models.EventWhatsappTemplate.create.mockImplementation(async (row) => row);

  const result = await mod.ensureEventWhatsappTemplates(
    fakeEvent({ id: "evt_second", ownerId: "usr_1" }),
  );

  expect(createMessageTemplate).not.toHaveBeenCalled();
  expect(models.WhatsappMessageTemplate.create).not.toHaveBeenCalled();
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      eventId: "evt_second",
      whatsappMessageTemplateId: "tpl_origin",
      slot: 2,
      isCampaign: true,
      slotMappings: sourceLink.slotMappings,
    }),
  );
  expect(result).toMatchObject({ attached: true, cloned: false });
});

test("ensure no hereda defaults de un WABA anterior", async () => {
  const createMessageTemplate = jest.fn();
  const resolveActiveWhatsappMetaByOwner = jest.fn(async () => ({
    credentials: { wabaId: "waba_new", accessToken: "tok", phoneNumberId: "1" },
  }));
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        ensurePlatformCanManageWaba: jest.fn(async () => ({ shared: true, assigned: true })),
        createMessageTemplate,
        updateMessageTemplate: jest.fn(),
        uploadResumableHeader: jest.fn(),
        deleteMessageTemplate: jest.fn(),
      }),
      "src/services/whatsapp-meta.service.js": () => ({
        resolveActiveWhatsappMetaByOwner,
      }),
    },
  });
  const oldDefault = {
    id: "tpl_old",
    ownerUserId: "usr_1",
    wabaId: "waba_old",
    isWabaDefault: true,
  };
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);
  models.WhatsappMessageTemplate.findAll.mockImplementation(async ({ where } = {}) => (
    where?.wabaId === "waba_new" ? [] : [oldDefault]
  ));
  models.Event.findAll.mockResolvedValue([]);

  const result = await mod.ensureEventWhatsappTemplates(
    fakeEvent({ id: "evt_new", ownerId: "usr_1" }),
  );

  expect(resolveActiveWhatsappMetaByOwner).toHaveBeenCalledWith("usr_1");
  expect(models.WhatsappMessageTemplate.findAll).toHaveBeenCalledWith({
    where: { ownerUserId: "usr_1", isWabaDefault: true, wabaId: "waba_new" },
    order: [["createdAt", "ASC"]],
  });
  expect(createMessageTemplate).not.toHaveBeenCalled();
  expect(models.EventWhatsappTemplate.create).not.toHaveBeenCalled();
  expect(result).toMatchObject({ attached: false, cloned: false });
});

test("ensure retargetea el campaign de un WABA anterior al default actual", async () => {
  const createMessageTemplate = jest.fn();
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "tok",
        ensurePlatformCanManageWaba: jest.fn(async () => ({ shared: true, assigned: true })),
        createMessageTemplate,
        updateMessageTemplate: jest.fn(),
        uploadResumableHeader: jest.fn(),
        deleteMessageTemplate: jest.fn(),
      }),
      ...ownerMetaMocks("waba_new"),
    },
  });
  const newDefault = {
    id: "tpl_new",
    ownerUserId: "usr_1",
    wabaId: "waba_new",
    isWabaDefault: true,
  };
  const stalePivot = {
    eventId: "evt_1",
    slot: 1,
    isCampaign: true,
    whatsappMessageTemplateId: "tpl_old",
    slotMappings: { "1": { type: "field", key: "nombre" } },
    template: { id: "tpl_old", wabaId: "waba_old", isWabaDefault: true },
    update: jest.fn(async function update(patch) {
      Object.assign(this, patch);
      return this;
    }),
  };
  const sourceLink = {
    eventId: "evt_other",
    whatsappMessageTemplateId: "tpl_new",
    slot: 1,
    isCampaign: true,
    slotMappings: {
      "1": { type: "field", key: "nombre" },
      "2": { type: "field", key: "numero_invitados" },
    },
  };
  models.EventWhatsappTemplate.findAll.mockImplementation(async ({ where } = {}) => {
    if (where?.eventId === "evt_1") return [stalePivot];
    if (where?.whatsappMessageTemplateId) return [sourceLink];
    return [];
  });
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([newDefault]);

  const result = await mod.ensureEventWhatsappTemplates(
    fakeEvent({ id: "evt_1", ownerId: "usr_1" }),
  );

  expect(createMessageTemplate).not.toHaveBeenCalled();
  expect(models.EventWhatsappTemplate.create).not.toHaveBeenCalled();
  expect(stalePivot.update).toHaveBeenCalledWith({
    whatsappMessageTemplateId: "tpl_new",
    slotMappings: sourceLink.slotMappings,
  });
  expect(result).toMatchObject({ attached: true, cloned: false });
});

test("segunda ensure del mismo evento no repite el POST a Graph", async () => {
  const createMessageTemplate = jest.fn(async () => ({ id: "meta_clone" }));
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        ensurePlatformCanManageWaba: jest.fn(async () => ({ shared: true, assigned: true })),
        createMessageTemplate,
        updateMessageTemplate: jest.fn(),
        uploadResumableHeader: jest.fn(),
        deleteMessageTemplate: jest.fn(),
      }),
      ...ownerMetaMocks(),
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
  models.EventWhatsappTemplate.create.mockImplementation(async (row) => {
    targetLinks = [row];
    return row;
  });
  const event = fakeEvent({ id: "evt_second", ownerId: "usr_1" });

  await mod.ensureEventWhatsappTemplates(event);
  const result = await mod.ensureEventWhatsappTemplates(event);

  expect(createMessageTemplate).not.toHaveBeenCalled();
  expect(models.WhatsappMessageTemplate.create).not.toHaveBeenCalled();
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({ attached: false, cloned: false, links: targetLinks });
});

test("ensure marca como default la APPROVED más antigua del WABA actual y la adjunta", async () => {
  const createMessageTemplate = jest.fn();
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        ensurePlatformCanManageWaba: jest.fn(async () => ({ shared: true, assigned: true })),
        createMessageTemplate,
        updateMessageTemplate: jest.fn(),
        uploadResumableHeader: jest.fn(),
        deleteMessageTemplate: jest.fn(),
      }),
      ...ownerMetaMocks(),
    },
  });
  const rejected = hsmRow({
    id: "tpl_rejected",
    status: "REJECTED",
    createdAt: new Date("2026-01-01"),
  });
  const oldestApproved = hsmRow({
    id: "tpl_approved_old",
    status: "APPROVED",
    createdAt: new Date("2026-01-02"),
  });
  const newerApproved = hsmRow({
    id: "tpl_approved_new",
    status: "APPROVED",
    createdAt: new Date("2026-01-03"),
  });
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);
  models.WhatsappMessageTemplate.findAll.mockImplementation(async ({ where } = {}) => {
    if (where?.isWabaDefault === true) return [];
    return [rejected, oldestApproved, newerApproved];
  });
  models.Event.findAll.mockResolvedValue([fakeEvent({ id: "evt_sibling", ownerId: "usr_1" })]);
  models.EventWhatsappTemplate.create.mockImplementation(async (row) => row);

  const result = await mod.ensureEventWhatsappTemplates(
    fakeEvent({ id: "evt_new", ownerId: "usr_1" }),
  );

  expect(createMessageTemplate).not.toHaveBeenCalled();
  expect(models.WhatsappMessageTemplate.create).not.toHaveBeenCalled();
  expect(models.WhatsappMessageTemplate.destroy).not.toHaveBeenCalled();
  expect(oldestApproved.update).toHaveBeenCalledWith({ isWabaDefault: true });
  expect(rejected.update).not.toHaveBeenCalled();
  expect(newerApproved.update).not.toHaveBeenCalled();
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      eventId: "evt_new",
      whatsappMessageTemplateId: "tpl_approved_old",
    }),
  );
  expect(result).toMatchObject({ attached: true, cloned: false });
});

test("ensure marca como default la PENDING más antigua si no hay APPROVED", async () => {
  const createMessageTemplate = jest.fn();
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        ensurePlatformCanManageWaba: jest.fn(async () => ({ shared: true, assigned: true })),
        createMessageTemplate,
        updateMessageTemplate: jest.fn(),
        uploadResumableHeader: jest.fn(),
        deleteMessageTemplate: jest.fn(),
      }),
      ...ownerMetaMocks(),
    },
  });
  const pending = hsmRow({
    id: "tpl_pending",
    status: "PENDING",
    createdAt: new Date("2026-01-01"),
  });
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);
  models.WhatsappMessageTemplate.findAll.mockImplementation(async ({ where } = {}) => {
    if (where?.isWabaDefault === true) return [];
    return [pending];
  });
  models.EventWhatsappTemplate.create.mockImplementation(async (row) => row);

  const result = await mod.ensureEventWhatsappTemplates(
    fakeEvent({ id: "evt_new", ownerId: "usr_1" }),
  );

  expect(createMessageTemplate).not.toHaveBeenCalled();
  expect(pending.update).toHaveBeenCalledWith({ isWabaDefault: true });
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      eventId: "evt_new",
      whatsappMessageTemplateId: "tpl_pending",
    }),
  );
  expect(result).toMatchObject({ attached: true, cloned: false });
});

test("ensure no inventa HSM si solo hay plantillas REJECTED", async () => {
  const createMessageTemplate = jest.fn();
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        ensurePlatformCanManageWaba: jest.fn(async () => ({ shared: true, assigned: true })),
        createMessageTemplate,
        updateMessageTemplate: jest.fn(),
        uploadResumableHeader: jest.fn(),
        deleteMessageTemplate: jest.fn(),
      }),
      ...ownerMetaMocks(),
    },
  });
  const rejected = hsmRow({
    id: "tpl_rejected",
    status: "REJECTED",
    createdAt: new Date("2026-01-01"),
  });
  const siblingLink = {
    eventId: "evt_sibling",
    whatsappMessageTemplateId: rejected.id,
    slot: 1,
    isCampaign: true,
    slotMappings: {},
    template: rejected,
  };
  models.EventWhatsappTemplate.findAll.mockImplementation(async ({ where } = {}) => {
    if (where?.eventId === "evt_sibling") return [siblingLink];
    return [];
  });
  models.WhatsappMessageTemplate.findAll.mockImplementation(async ({ where } = {}) => {
    if (where?.isWabaDefault === true) return [];
    return [rejected];
  });
  models.Event.findAll.mockResolvedValue([fakeEvent({ id: "evt_sibling", ownerId: "usr_1" })]);

  const result = await mod.ensureEventWhatsappTemplates(
    fakeEvent({ id: "evt_new", ownerId: "usr_1" }),
  );

  expect(createMessageTemplate).not.toHaveBeenCalled();
  expect(models.WhatsappMessageTemplate.create).not.toHaveBeenCalled();
  expect(rejected.update).not.toHaveBeenCalled();
  expect(models.EventWhatsappTemplate.create).not.toHaveBeenCalled();
  expect(result).toMatchObject({ attached: false, cloned: false });
});

test("submit edita en Graph una plantilla usada por un solo pivot", async () => {
  const updateMessageTemplate = jest.fn(async () => ({ id: "meta_1" }));
  const createMessageTemplate = jest.fn();
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      ...ownerMetaMocks(),
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: (token) => token || "sys_tok",
        ensurePlatformCanManageWaba: jest.fn(async () => ({ shared: true, assigned: true })),
        createMessageTemplate,
        updateMessageTemplate,
        uploadResumableHeader: jest.fn(),
        deleteMessageTemplate: jest.fn(),
      }),
    },
  });
  const event = fakeEvent({ id: "evt_1", ownerId: "usr_1" });
  const template = {
    id: "tpl_1",
    metaTemplateId: "meta_1",
    wabaId: "waba_1",
    name: "alanna_pc_1",
    language: "es_MX",
    category: "MARKETING",
    headerType: "none",
    status: "APPROVED",
    update: jest.fn(async function update(patch) {
      Object.assign(this, patch);
      return this;
    }),
  };
  const pivot = {
    eventId: event.id,
    slot: 1,
    whatsappMessageTemplateId: template.id,
    template,
    update: jest.fn(async function update(patch) {
      Object.assign(this, patch);
      return this;
    }),
  };
  models.Event.findOne.mockResolvedValue(event);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([pivot]);
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.findOne.mockResolvedValue(pivot);
  models.EventWhatsappTemplate.count.mockResolvedValue(1);

  const result = await mod.submitEventTemplate({
    eventId: event.id,
    ownerUserId: "usr_1",
    slot: 1,
    body: "Hola {{1}}, tienes {{2}} pases reservados. Confirma por este chat, por favor.",
    headerType: "none",
    slotMappings: {},
    isCampaign: false,
  });

  expect(updateMessageTemplate).toHaveBeenCalledWith({
    templateId: "meta_1",
    token: "tok",
    payload: expect.objectContaining({
      language: "es_MX",
      category: "MARKETING",
      components: expect.any(Array),
    }),
  });
  expect(createMessageTemplate).not.toHaveBeenCalled();
  expect(template.update).toHaveBeenCalledWith(expect.objectContaining({
    status: "PENDING",
    rejectedReason: null,
  }));
  expect(result).toBe(template);
});

test("submit persiste displayName en update in-place de personalizada", async () => {
  const updateMessageTemplate = jest.fn(async () => ({ id: "meta_1" }));
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      ...ownerMetaMocks(),
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: (token) => token || "sys_tok",
        ensurePlatformCanManageWaba: jest.fn(async () => ({ shared: true, assigned: true })),
        createMessageTemplate: jest.fn(),
        updateMessageTemplate,
        uploadResumableHeader: jest.fn(),
        deleteMessageTemplate: jest.fn(),
      }),
    },
  });
  const event = fakeEvent({ id: "evt_1", ownerId: "usr_1" });
  const template = {
    id: "tpl_1",
    metaTemplateId: "meta_1",
    wabaId: "waba_1",
    name: "alanna_pc_1",
    language: "es_MX",
    category: "MARKETING",
    headerType: "none",
    status: "APPROVED",
    isWabaDefault: false,
    displayName: "Viejo",
    update: jest.fn(async function update(patch) {
      Object.assign(this, patch);
      return this;
    }),
  };
  const pivot = {
    eventId: event.id,
    slot: 1,
    whatsappMessageTemplateId: template.id,
    template,
    update: jest.fn(async function update(patch) {
      Object.assign(this, patch);
      return this;
    }),
  };
  models.Event.findOne.mockResolvedValue(event);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([pivot]);
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.findOne.mockResolvedValue(pivot);
  models.EventWhatsappTemplate.count.mockResolvedValue(1);

  await mod.submitEventTemplate({
    eventId: event.id,
    ownerUserId: "usr_1",
    slot: 1,
    body: WIZARD_BODY,
    headerType: "none",
    slotMappings: {},
    isCampaign: false,
    displayName: "  Invitación con mesa  ",
  });

  expect(updateMessageTemplate).toHaveBeenCalledTimes(1);
  expect(template.update).toHaveBeenCalledWith(expect.objectContaining({
    displayName: "Invitación con mesa",
  }));
  expect(updateMessageTemplate.mock.calls[0][0].payload).not.toHaveProperty("displayName");
});

test("submit recrea en Graph el draft del slot 2 sin metaTemplateId", async () => {
  const createMessageTemplate = jest.fn(async () => ({ id: "meta_2" }));
  const updateMessageTemplate = jest.fn();
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      ...ownerMetaMocks(),
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        ensurePlatformCanManageWaba: jest.fn(async () => ({ shared: true, assigned: true })),
        createMessageTemplate,
        updateMessageTemplate,
        uploadResumableHeader: jest.fn(),
        deleteMessageTemplate: jest.fn(),
      }),
    },
  });
  const event = fakeEvent({ id: "evt_1", ownerId: "usr_1" });
  const template = {
    id: "tpl_2",
    metaTemplateId: null,
    wabaId: "waba_1",
    name: "alanna_pc_2",
    language: "es_MX",
    category: "MARKETING",
    headerType: "none",
    status: "DRAFT",
    update: jest.fn(async function update(patch) {
      Object.assign(this, patch);
      return this;
    }),
  };
  const pivot = {
    eventId: event.id,
    slot: 2,
    whatsappMessageTemplateId: template.id,
    template,
    update: jest.fn(async function update(patch) {
      Object.assign(this, patch);
      return this;
    }),
  };
  models.Event.findOne.mockResolvedValue(event);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([pivot]);
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.findOne.mockResolvedValue(pivot);
  models.EventWhatsappTemplate.count.mockResolvedValue(1);

  const result = await mod.submitEventTemplate({
    eventId: event.id,
    ownerUserId: "usr_1",
    slot: 2,
    body: "Hola {{1}}, tienes {{2}} pases reservados. Confirma por este chat, por favor.",
    headerType: "none",
    slotMappings: {},
    isCampaign: false,
  });

  expect(createMessageTemplate).toHaveBeenCalledTimes(1);
  expect(updateMessageTemplate).not.toHaveBeenCalled();
  expect(template.update).toHaveBeenCalledWith(expect.objectContaining({
    metaTemplateId: "meta_2",
    status: "PENDING",
  }));
  expect(pivot.update).toHaveBeenCalledWith({
    slotMappings: expect.objectContaining({
      1: { type: "field", key: "nombre" },
      2: { type: "field", key: "numero_invitados" },
    }),
  });
  expect(result).toBe(template);
});

test("submit hace copy-on-write cuando dos pivots comparten plantilla", async () => {
  const createMessageTemplate = jest.fn(async () => ({ id: "meta_clone" }));
  const updateMessageTemplate = jest.fn();
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      ...ownerMetaMocks(),
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        ensurePlatformCanManageWaba: jest.fn(async () => ({ shared: true, assigned: true })),
        createMessageTemplate,
        updateMessageTemplate,
        uploadResumableHeader: jest.fn(),
        deleteMessageTemplate: jest.fn(),
      }),
    },
  });
  const event = fakeEvent({ id: "evt_2", ownerId: "usr_1" });
  const template = {
    id: "tpl_shared",
    metaTemplateId: "meta_shared",
    wabaId: "waba_1",
    name: "alanna_pc_shared",
    language: "es_MX",
    category: "MARKETING",
    headerType: "none",
    status: "APPROVED",
  };
  const pivot = {
    eventId: event.id,
    slot: 1,
    whatsappMessageTemplateId: template.id,
    template,
    update: jest.fn(async function update(patch) {
      Object.assign(this, patch);
      return this;
    }),
  };
  models.Event.findOne.mockResolvedValue(event);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([pivot]);
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.findOne.mockResolvedValue(pivot);
  models.EventWhatsappTemplate.count.mockResolvedValue(2);
  models.WhatsappMessageTemplate.create.mockImplementation(async (row) => ({
    ...row,
    id: "tpl_clone",
    update: jest.fn(),
  }));

  const result = await mod.submitEventTemplate({
    eventId: event.id,
    ownerUserId: "usr_1",
    slot: 1,
    body: "Hola {{1}}, tienes {{2}} pases reservados. Confirma por este chat, por favor.",
    headerType: "none",
    slotMappings: {},
    isCampaign: false,
  });

  expect(updateMessageTemplate).not.toHaveBeenCalled();
  expect(createMessageTemplate).toHaveBeenCalledTimes(1);
  expect(models.WhatsappMessageTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      metaTemplateId: "meta_clone",
      clonedFromId: "tpl_shared",
      status: "PENDING",
      isWabaDefault: false,
    }),
  );
  expect(pivot.update).toHaveBeenCalledWith(expect.objectContaining({
    whatsappMessageTemplateId: "tpl_clone",
  }));
  expect(result.id).toBe("tpl_clone");
});

test("setCampaignSlot desmarca el slot anterior y marca el solicitado", async () => {
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        ensurePlatformCanManageWaba: jest.fn(async () => ({ shared: true, assigned: true })),
        createMessageTemplate: jest.fn(),
        updateMessageTemplate: jest.fn(),
        uploadResumableHeader: jest.fn(),
        deleteMessageTemplate: jest.fn(),
      }),
    },
  });

  await mod.setCampaignSlot({ eventId: "evt_1", slot: 2 });

  expect(models.EventWhatsappTemplate.update).toHaveBeenNthCalledWith(
    1,
    { isCampaign: false },
    { where: { eventId: "evt_1" } },
  );
  expect(models.EventWhatsappTemplate.update).toHaveBeenNthCalledWith(
    2,
    { isCampaign: true },
    { where: { eventId: "evt_1", slot: 2 } },
  );
});

test("submit conserva el status previo cuando Graph falla", async () => {
  const graphError = Object.assign(new Error("Meta no pudo actualizar la plantilla."), {
    status: 502,
  });
  const updateMessageTemplate = jest.fn().mockRejectedValue(graphError);
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      ...ownerMetaMocks(),
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        ensurePlatformCanManageWaba: jest.fn(async () => ({ shared: true, assigned: true })),
        createMessageTemplate: jest.fn(),
        updateMessageTemplate,
        uploadResumableHeader: jest.fn(),
        deleteMessageTemplate: jest.fn(),
      }),
    },
  });
  const event = fakeEvent({ id: "evt_1", ownerId: "usr_1" });
  const template = {
    id: "tpl_1",
    metaTemplateId: "meta_1",
    wabaId: "waba_1",
    language: "es_MX",
    category: "MARKETING",
    headerType: "none",
    status: "REJECTED",
    update: jest.fn(),
  };
  const pivot = {
    eventId: event.id,
    slot: 1,
    whatsappMessageTemplateId: template.id,
    template,
  };
  models.Event.findOne.mockResolvedValue(event);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([pivot]);
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.findOne.mockResolvedValue(pivot);
  models.EventWhatsappTemplate.count.mockResolvedValue(1);

  await expect(mod.submitEventTemplate({
    eventId: event.id,
    ownerUserId: "usr_1",
    slot: 1,
    body: "Hola {{1}}, tienes {{2}} pases reservados. Confirma por este chat, por favor.",
    headerType: "none",
    slotMappings: {},
    isCampaign: false,
  })).rejects.toBe(graphError);

  expect(template.status).toBe("REJECTED");
  expect(template.update).not.toHaveBeenCalled();
});

test("submit crea la segunda plantilla y su pivot cuando el slot está vacío", async () => {
  const createMessageTemplate = jest.fn(async () => ({ id: "meta_2" }));
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        ensurePlatformCanManageWaba: jest.fn(async () => ({ shared: true, assigned: true })),
        createMessageTemplate,
        updateMessageTemplate: jest.fn(),
        uploadResumableHeader: jest.fn(),
        deleteMessageTemplate: jest.fn(),
      }),
      "src/services/whatsapp-meta.service.js": () => ({
        resolveActiveWhatsappMetaByOwner: jest.fn(async () => ({
          credentials: { accessToken: "planner_tok", wabaId: "waba_1" },
        })),
      }),
    },
  });
  const event = fakeEvent({ id: "evt_1", ownerId: "usr_1" });
  const row = {
    id: "tpl_2",
    status: "DRAFT",
    update: jest.fn(async function update(patch) {
      Object.assign(this, patch);
      return this;
    }),
  };
  models.Event.findOne.mockResolvedValue(event);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([]);
  models.Event.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.findOne.mockResolvedValue(null);
  models.WhatsappMessageTemplate.create.mockResolvedValue(row);
  models.EventWhatsappTemplate.create.mockImplementation(async (pivot) => pivot);

  const result = await mod.submitEventTemplate({
    eventId: event.id,
    ownerUserId: "usr_1",
    slot: 2,
    body: "Hola {{1}}, tienes {{2}} pases reservados. Confirma por este chat, por favor.",
    headerType: "none",
    slotMappings: {},
    isCampaign: false,
  });

  expect(createMessageTemplate).toHaveBeenCalledTimes(1);
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      eventId: "evt_1",
      whatsappMessageTemplateId: "tpl_2",
      slot: 2,
      isCampaign: false,
    }),
  );
  expect(row.update).toHaveBeenCalledWith(expect.objectContaining({
    metaTemplateId: "meta_2",
    status: "PENDING",
  }));
  expect(result).toBe(row);
});

test("submit conserva en DRAFT una segunda plantilla si Graph falla al crearla", async () => {
  const graphError = Object.assign(new Error("Meta no pudo crear la plantilla."), {
    status: 502,
  });
  const createMessageTemplate = jest.fn().mockRejectedValue(graphError);
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        ensurePlatformCanManageWaba: jest.fn(async () => ({ shared: true, assigned: true })),
        createMessageTemplate,
        updateMessageTemplate: jest.fn(),
        uploadResumableHeader: jest.fn(),
        deleteMessageTemplate: jest.fn(),
      }),
      "src/services/whatsapp-meta.service.js": () => ({
        resolveActiveWhatsappMetaByOwner: jest.fn(async () => ({
          credentials: { accessToken: "planner_tok", wabaId: "waba_1" },
        })),
      }),
    },
  });
  const event = fakeEvent({ id: "evt_1", ownerId: "usr_1" });
  const row = {
    id: "tpl_2",
    status: "DRAFT",
    update: jest.fn(async function update(patch) {
      Object.assign(this, patch);
      return this;
    }),
  };
  models.Event.findOne.mockResolvedValue(event);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([]);
  models.Event.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.findOne.mockResolvedValue(null);
  models.WhatsappMessageTemplate.create.mockResolvedValue(row);
  models.EventWhatsappTemplate.create.mockImplementation(async (pivot) => pivot);

  await expect(mod.submitEventTemplate({
    eventId: event.id,
    ownerUserId: "usr_1",
    slot: 2,
    body: "Hola {{1}}, tienes {{2}} pases reservados. Confirma por este chat, por favor.",
    headerType: "none",
    slotMappings: {},
    isCampaign: false,
  })).rejects.toBe(graphError);

  expect(row.status).toBe("DRAFT");
  expect(row.update).not.toHaveBeenCalled();
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledTimes(1);
});

test("assertCampaignTemplateReady exige una plantilla marcada para campaña", async () => {
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js");
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([]);
  models.Event.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.findOne.mockResolvedValue(null);

  await expect(mod.assertCampaignTemplateReady(
    fakeEvent({ id: "evt_1", ownerId: "usr_1" }),
  )).rejects.toMatchObject({
    status: 400,
    message: "Crea una plantilla de primer contacto y espera la aprobación de Meta.",
  });
});

test("assertCampaignTemplateReady exige que Meta haya aprobado la campaña", async () => {
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js");
  const link = {
    eventId: "evt_1",
    isCampaign: true,
    template: { id: "tpl_1", status: "PENDING", headerType: "none" },
  };
  models.EventWhatsappTemplate.findAll.mockResolvedValue([link]);
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.findOne.mockResolvedValue(link);

  await expect(mod.assertCampaignTemplateReady(
    fakeEvent({ id: "evt_1", ownerId: "usr_1" }),
  )).rejects.toMatchObject({
    status: 400,
    message: "Meta aún no aprueba la plantilla de campaña.",
  });
});

test("assertCampaignTemplateReady exige el archivo del encabezado", async () => {
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js");
  const link = {
    eventId: "evt_1",
    isCampaign: true,
    template: {
      id: "tpl_1",
      status: "APPROVED",
      headerType: "document",
      headerMediaPath: null,
    },
  };
  models.EventWhatsappTemplate.findAll.mockResolvedValue([link]);
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.findOne.mockResolvedValue(link);

  await expect(mod.assertCampaignTemplateReady(
    fakeEvent({ id: "evt_1", ownerId: "usr_1" }),
  )).rejects.toMatchObject({
    status: 400,
    message: "La plantilla de campaña requiere un archivo de encabezado.",
  });
});

test("assertCampaignTemplateReady propaga errores al asegurar plantillas", async () => {
  const graphError = Object.assign(new Error("Meta Graph no disponible."), { status: 502 });
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js");
  models.EventWhatsappTemplate.findAll.mockRejectedValue(graphError);

  await expect(mod.assertCampaignTemplateReady(
    fakeEvent({ id: "evt_1", ownerId: "usr_1" }),
  )).rejects.toBe(graphError);
});

test("resolveCampaignSendContext resuelve slots 1/2/3 y documento del template", async () => {
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js");
  const template = {
    id: "tpl_1",
    name: "alanna_campana_1",
    status: "APPROVED",
    headerType: "document",
    headerMediaPath: "template-headers/usr_1/tpl_1/invitacion.pdf",
    headerFileName: "invitacion.pdf",
    headerMime: "application/pdf",
  };
  const link = {
    eventId: "evt_1",
    isCampaign: true,
    slotMappings: {
      1: { type: "field", key: "nombre" },
      2: { type: "field", key: "evento" },
      3: { type: "field", key: "codigo" },
    },
    template,
  };
  models.EventWhatsappTemplate.findAll.mockResolvedValue([link]);
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.findOne.mockResolvedValue(link);
  const event = fakeEvent({ id: "evt_1", ownerId: "usr_1", name: "Boda Ana" });
  const guest = fakeGuest({
    rep: "Luis Pérez",
    customData: { codigo: "MESA-7" },
  });

  const context = await mod.resolveCampaignSendContext(event);

  expect(context).toMatchObject({
    template,
    link,
    hsmTemplateName: "alanna_campana_1",
    hsmHeaderDocument: {
      relativePath: "template-headers/usr_1/tpl_1/invitacion.pdf",
      fileName: "invitacion.pdf",
      mime: "application/pdf",
      eventId: "evt_1",
    },
    hsmHeaderImage: null,
  });
  await expect(context.hsmParamsFor(guest, "Planner Ana"))
    .resolves.toEqual(["Luis", "Boda Ana", "MESA-7"]);
});

test("resolveOwnerCampaignSendContext usa la campaña más reciente del WABA activo", async () => {
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js");
  const event = fakeEvent({ id: "evt_latest", ownerId: "usr_1" });
  const template = {
    id: "tpl_1",
    name: "alanna_live_1",
    status: "APPROVED",
    headerType: "none",
    headerMediaPath: null,
  };
  const link = {
    isCampaign: true,
    eventId: event.id,
    Event: event,
    slotMappings: {},
    template,
  };
  models.EventWhatsappTemplate.findOne.mockResolvedValue(link);

  const context = await mod.resolveOwnerCampaignSendContext({
    ownerUserId: "usr_1",
    wabaId: "waba_new",
  });

  expect(models.EventWhatsappTemplate.findOne).toHaveBeenCalledWith({
    where: { isCampaign: true },
    include: [
      { model: models.Event, required: true, where: { ownerId: "usr_1" } },
      {
        model: models.WhatsappMessageTemplate,
        as: "template",
        required: true,
        where: { wabaId: "waba_new" },
      },
    ],
    order: [[{ model: models.Event }, "createdAt", "DESC"]],
  });
  expect(context.hsmTemplateName).toBe("alanna_live_1");
});

test("resolveOwnerCampaignSendContext 400 sin pivot isCampaign del WABA activo", async () => {
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js");
  models.EventWhatsappTemplate.findOne.mockResolvedValue(null);

  await expect(mod.resolveOwnerCampaignSendContext({
    ownerUserId: "usr_1",
    wabaId: "waba_new",
  })).rejects.toMatchObject({
    status: 400,
    message: "Crea una plantilla de primer contacto y espera la aprobación de Meta.",
  });
  expect(models.WhatsappMessageTemplate.findOne).not.toHaveBeenCalled();
});

test("resolveOwnerCampaignSendContext 400 aunque existan defaults del WABA sin pivot isCampaign", async () => {
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js");
  models.EventWhatsappTemplate.findOne.mockResolvedValue(null);

  await expect(mod.resolveOwnerCampaignSendContext({
    ownerUserId: "usr_1",
    wabaId: "waba_new",
  })).rejects.toMatchObject({
    status: 400,
    message: "Crea una plantilla de primer contacto y espera la aprobación de Meta.",
  });
  expect(models.WhatsappMessageTemplate.findOne).not.toHaveBeenCalled();
});

test("resolveOwnerCampaignSendContext 400 si la campaña del WABA no está APPROVED", async () => {
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js");
  models.EventWhatsappTemplate.findOne.mockResolvedValue({
    isCampaign: true,
    eventId: "evt_1",
    Event: fakeEvent({ id: "evt_1", ownerId: "usr_1" }),
    template: { name: "alanna_pending", status: "PENDING", headerType: "none" },
  });

  await expect(mod.resolveOwnerCampaignSendContext({
    ownerUserId: "usr_1",
    wabaId: "waba_new",
  })).rejects.toMatchObject({
    status: 400,
    message: "Meta aún no aprueba la plantilla de campaña.",
  });
});

test("listOwnerTemplates serializa usage del WABA actual", async () => {
  const { mod, models } = await loadLibraryService();
  const row = libraryTemplate({
    isWabaDefault: true,
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
  });
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([row]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([
    {
      whatsappMessageTemplateId: "tpl_1",
      isCampaign: true,
      Event: { id: "evt_1", name: "Boda Ana" },
    },
    {
      whatsappMessageTemplateId: "tpl_1",
      isCampaign: true,
      Event: { id: "evt_2", name: "Boda Bea" },
    },
    {
      whatsappMessageTemplateId: "tpl_1",
      isCampaign: false,
      Event: { id: "evt_3", name: "Boda Cal" },
    },
  ]);

  const listed = await mod.listOwnerTemplates("usr_1");

  expect(models.WhatsappMessageTemplate.findAll).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { ownerUserId: "usr_1", wabaId: "waba_1" },
    }),
  );
  expect(listed).toHaveLength(1);
  expect(listed[0]).toMatchObject({
    id: "tpl_1",
    name: "alanna_pc_ab12cd34_1",
    status: "APPROVED",
    headerType: "none",
    isWabaDefault: true,
    slotMappings: {},
    usage: {
      eventCount: 3,
      campaignEventCount: 2,
      events: [
        { id: "evt_1", name: "Boda Ana" },
        { id: "evt_2", name: "Boda Bea" },
        { id: "evt_3", name: "Boda Cal" },
      ],
    },
  });
});

test("listOwnerTemplates incluye slotMappings de cualquier pivot", async () => {
  const { mod, models } = await loadLibraryService();
  const row = libraryTemplate({ isWabaDefault: true });
  const extraMappings = {
    ...LOCKED_MAPPINGS,
    "3": { type: "field", key: "evento" },
    "4": { type: "field", key: "fecha" },
    "5": { type: "field", key: "lugar" },
  };
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([row]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([
    {
      whatsappMessageTemplateId: "tpl_1",
      isCampaign: true,
      slotMappings: extraMappings,
      Event: { id: "evt_1", name: "Boda Ana" },
    },
    {
      whatsappMessageTemplateId: "tpl_1",
      isCampaign: false,
      slotMappings: extraMappings,
      Event: { id: "evt_2", name: "Boda Bea" },
    },
  ]);

  const listed = await mod.listOwnerTemplates("usr_1");

  expect(listed[0].slotMappings).toEqual(extraMappings);
});

test("listOwnerTemplates promueve la APPROVED más antigua si no hay isWabaDefault", async () => {
  const { mod, models } = await loadLibraryService();
  const oldestApproved = libraryTemplate({
    id: "tpl_approved_old",
    status: "APPROVED",
    isWabaDefault: false,
    createdAt: new Date("2026-01-02"),
  });
  const newerApproved = libraryTemplate({
    id: "tpl_approved_new",
    name: "alanna_pc_newer_1",
    metaTemplateId: "meta_newer",
    status: "APPROVED",
    isWabaDefault: false,
    createdAt: new Date("2026-01-03"),
  });
  models.WhatsappMessageTemplate.findAll.mockImplementation(async ({ where } = {}) => {
    if (where?.isWabaDefault === true) return [];
    return [oldestApproved, newerApproved];
  });
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);

  const listed = await mod.listOwnerTemplates("usr_1");

  expect(oldestApproved.update).toHaveBeenCalledWith({ isWabaDefault: true });
  expect(newerApproved.update).not.toHaveBeenCalled();
  expect(listed.map((row) => row.id)).toEqual(["tpl_approved_old", "tpl_approved_new"]);
});

test("deleteOwnerTemplate llama Graph y destruye pivots y HSM", async () => {
  const { mod, models, deleteMessageTemplate, resolveTemplateCrudToken } = await loadLibraryService();
  const template = libraryTemplate();
  models.WhatsappMessageTemplate.findOne.mockResolvedValue(template);
  models.Campaign.findAll.mockResolvedValue([]);
  models.Event.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([]);

  await mod.deleteOwnerTemplate({ ownerUserId: "usr_1", templateId: "tpl_1" });

  expect(resolveTemplateCrudToken).toHaveBeenCalledWith("tok");
  expect(deleteMessageTemplate).toHaveBeenCalledWith({
    wabaId: "waba_1",
    token: "tok",
    name: "alanna_pc_ab12cd34_1",
    metaTemplateId: "meta_tpl_1",
  });
  expect(models.EventWhatsappTemplate.destroy).toHaveBeenCalledWith({
    where: { whatsappMessageTemplateId: "tpl_1" },
  });
  expect(template.destroy).toHaveBeenCalled();
});

test("deleteOwnerTemplate no destruye local si Graph throw", async () => {
  const deleteMessageTemplate = jest.fn(async () => {
    const err = new Error("No se pudo contactar la API de Meta.");
    err.status = 502;
    throw err;
  });
  const { mod, models } = await loadLibraryService({ deleteMessageTemplate });
  const template = libraryTemplate();
  models.WhatsappMessageTemplate.findOne.mockResolvedValue(template);
  models.Campaign.findAll.mockResolvedValue([]);
  models.Event.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([]);

  await expect(mod.deleteOwnerTemplate({
    ownerUserId: "usr_1",
    templateId: "tpl_1",
  })).rejects.toMatchObject({ status: 502 });

  expect(deleteMessageTemplate).toHaveBeenCalled();
  expect(models.EventWhatsappTemplate.destroy).not.toHaveBeenCalled();
  expect(template.destroy).not.toHaveBeenCalled();
});

test("deleteOwnerTemplate loguea y relanza si Graph OK y falla el destroy local", async () => {
  const { mod, models, deleteMessageTemplate } = await loadLibraryService();
  const template = libraryTemplate();
  models.WhatsappMessageTemplate.findOne.mockResolvedValue(template);
  models.Campaign.findAll.mockResolvedValue([]);
  models.Event.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.destroy.mockRejectedValue(new Error("Deadlock"));
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    await expect(mod.deleteOwnerTemplate({
      ownerUserId: "usr_1",
      templateId: "tpl_1",
    })).rejects.toThrow("Deadlock");

    expect(deleteMessageTemplate).toHaveBeenCalled();
    expect(template.destroy).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
    const logged = spy.mock.calls.map((args) => String(args[0] || "")).join("\n");
    expect(logged).toMatch(/Graph ya borró/);
    expect(logged).toMatch(/tpl_1/);
  } finally {
    spy.mockRestore();
  }
});

test("deleteOwnerTemplate 409 si hay campaña queued que usa la HSM", async () => {
  const { mod, models, deleteMessageTemplate } = await loadLibraryService();
  const template = libraryTemplate();
  models.WhatsappMessageTemplate.findOne.mockResolvedValue(template);
  models.Campaign.findAll.mockResolvedValue([{
    id: "cmp_1",
    status: "queued",
    eventId: "evt_1",
    Event: fakeEvent({ id: "evt_1", ownerId: "usr_1" }),
  }]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([{
    eventId: "evt_1",
    isCampaign: true,
    whatsappMessageTemplateId: "tpl_1",
    template: { id: "tpl_1", name: "alanna_pc_ab12cd34_1" },
  }]);

  await expect(mod.deleteOwnerTemplate({
    ownerUserId: "usr_1",
    templateId: "tpl_1",
  })).rejects.toMatchObject({
    status: 409,
    message: expect.stringMatching(/campaña/i),
  });
  expect(deleteMessageTemplate).not.toHaveBeenCalled();
  expect(models.EventWhatsappTemplate.destroy).not.toHaveBeenCalled();
  expect(template.destroy).not.toHaveBeenCalled();
});

test("deleteOwnerTemplate 409 si es el último default descubierto", async () => {
  const { mod, models, deleteMessageTemplate } = await loadLibraryService();
  const template = libraryTemplate({
    isWabaDefault: false,
    status: "APPROVED",
  });
  models.WhatsappMessageTemplate.findOne.mockResolvedValue(template);
  models.Campaign.findAll.mockResolvedValue([]);
  models.WhatsappMessageTemplate.findAll.mockImplementation(async ({ where } = {}) => {
    if (where?.isWabaDefault === true) return [];
    return [template];
  });
  models.Event.findAll.mockResolvedValue([fakeEvent({ id: "evt_1", ownerId: "usr_1", name: "Boda Ana" })]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);

  await expect(mod.deleteOwnerTemplate({
    ownerUserId: "usr_1",
    templateId: "tpl_1",
  })).rejects.toMatchObject({
    status: 409,
    message: "No se puede dejar eventos sin plantilla de primer contacto; primero crea otra o asígnala",
  });
  expect(deleteMessageTemplate).not.toHaveBeenCalled();
  expect(models.EventWhatsappTemplate.destroy).not.toHaveBeenCalled();
  expect(template.destroy).not.toHaveBeenCalled();
});

test("deleteOwnerTemplate 404 si la HSM no es del owner o es de otro WABA", async () => {
  const { mod, models, deleteMessageTemplate } = await loadLibraryService();
  models.WhatsappMessageTemplate.findOne.mockResolvedValue(null);

  await expect(mod.deleteOwnerTemplate({
    ownerUserId: "usr_1",
    templateId: "tpl_foreign",
  })).rejects.toMatchObject({ status: 404 });
  expect(models.WhatsappMessageTemplate.findOne).toHaveBeenCalledWith({
    where: { id: "tpl_foreign", ownerUserId: "usr_1", wabaId: "waba_1" },
  });
  expect(deleteMessageTemplate).not.toHaveBeenCalled();
});

test("deleteOwnerTemplate reattach del default tras borrar una personalizada de campaña", async () => {
  const { mod, models, deleteMessageTemplate } = await loadLibraryService();
  const custom = libraryTemplate({ isWabaDefault: false });
  const accountDefault = libraryTemplate({
    id: "tpl_default",
    name: "alanna_pc_default_1",
    metaTemplateId: "meta_default",
    isWabaDefault: true,
    status: "APPROVED",
  });
  models.WhatsappMessageTemplate.findOne.mockResolvedValue(custom);
  models.Campaign.findAll.mockResolvedValue([]);
  models.WhatsappMessageTemplate.findAll.mockImplementation(async ({ where } = {}) => {
    if (where?.isWabaDefault === true) return [accountDefault];
    if (where?.id && where.id !== custom.id) return [accountDefault];
    return [accountDefault];
  });
  models.Event.findAll.mockResolvedValue([
    fakeEvent({ id: "evt_1", ownerId: "usr_1" }),
  ]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.create.mockImplementation(async (row) => row);

  await mod.deleteOwnerTemplate({ ownerUserId: "usr_1", templateId: "tpl_1" });

  expect(deleteMessageTemplate).toHaveBeenCalled();
  expect(models.EventWhatsappTemplate.destroy).toHaveBeenCalledWith({
    where: { whatsappMessageTemplateId: "tpl_1" },
  });
  expect(custom.destroy).toHaveBeenCalled();
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      eventId: "evt_1",
      whatsappMessageTemplateId: "tpl_default",
      isCampaign: true,
    }),
  );
});

test("createEventCustomTemplate blank crea HSM propia en el siguiente slot", async () => {
  const { mod, models, createMessageTemplate } = await loadEventCustomService();
  models.EventWhatsappTemplate.findAll.mockResolvedValue([{ slot: 1 }, { slot: 2 }]);
  models.EventWhatsappTemplate.count.mockResolvedValue(2);

  const result = await mod.createEventCustomTemplate({
    eventId: "evt_1",
    ownerUserId: "usr_1",
    source: "blank",
    displayName: "Invitación con mesa",
    body: CUSTOM_EXTRA_BODY,
    headerType: "none",
    slotMappings: CUSTOM_EXTRA_MAPPINGS,
  });

  expect(createMessageTemplate).toHaveBeenCalledTimes(1);
  expect(models.WhatsappMessageTemplate.create.mock.calls[0][0].displayName).toBe("Invitación con mesa");
  expect(createMessageTemplate.mock.calls[0][0].payload).not.toHaveProperty("displayName");
  expect(models.WhatsappMessageTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      isWabaDefault: false,
      clonedFromId: null,
      language: "es_MX",
      category: "MARKETING",
      status: "PENDING",
    }),
  );
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      eventId: "evt_1",
      whatsappMessageTemplateId: "tpl_custom",
      slot: 3,
      isCampaign: false,
      slotMappings: expect.objectContaining({
        1: { type: "field", key: "nombre" },
        2: { type: "field", key: "numero_invitados" },
        3: { type: "field", key: "mesa" },
      }),
    }),
  );
  expect(result.link.slot).toBe(3);
  expect(result.template.isWabaDefault).toBe(false);
});

test("createEventCustomTemplate default clona el HSM del WABA con clonedFromId", async () => {
  const { mod, models, createMessageTemplate } = await loadEventCustomService();
  const origin = existingDefault({
    id: "tpl_default",
    wabaId: "waba_1",
    ownerUserId: "usr_1",
    headerType: "none",
  });
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([origin]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([{ slot: 1 }]);
  models.EventWhatsappTemplate.count.mockResolvedValue(1);

  const result = await mod.createEventCustomTemplate({
    eventId: "evt_1",
    ownerUserId: "usr_1",
    source: "default",
    displayName: "Copia del default",
  });

  expect(createMessageTemplate).toHaveBeenCalledTimes(1);
  expect(createMessageTemplate).toHaveBeenCalledWith(expect.objectContaining({
    payload: expect.objectContaining({
      language: "es_MX",
      category: "MARKETING",
      components: expect.arrayContaining([
        expect.objectContaining({ type: "BODY", text: WIZARD_BODY }),
      ]),
    }),
  }));
  expect(models.WhatsappMessageTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      isWabaDefault: false,
      clonedFromId: "tpl_default",
      status: "PENDING",
      displayName: "Copia del default",
    }),
  );
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      slot: 2,
      isCampaign: false,
      whatsappMessageTemplateId: "tpl_custom",
    }),
  );
  expect(result.template.clonedFromId).toBe("tpl_default");
});

test("createEventCustomTemplate default copia slotMappings extra del origin si no se envían", async () => {
  const { mod, models } = await loadEventCustomService();
  const origin = existingDefault({
    id: "tpl_default",
    wabaId: "waba_1",
    ownerUserId: "usr_1",
    components: [{
      type: "BODY",
      text: WIZARD_BODY_EXTRA,
      example: { body_text: [["María", "2", "evento", "fecha", "lugar"]] },
    }],
  });
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([origin]);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([{ slot: 1 }]);
  models.EventWhatsappTemplate.findOne.mockResolvedValue({
    whatsappMessageTemplateId: "tpl_default",
    slotMappings: {
      ...LOCKED_MAPPINGS,
      "3": { type: "field", key: "evento" },
      "4": { type: "field", key: "fecha" },
      "5": { type: "field", key: "lugar" },
    },
  });

  await mod.createEventCustomTemplate({
    eventId: "evt_1",
    ownerUserId: "usr_1",
    source: "default",
  });

  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      slotMappings: expect.objectContaining({
        3: { type: "field", key: "evento" },
        4: { type: "field", key: "fecha" },
        5: { type: "field", key: "lugar" },
      }),
    }),
  );
});

test("createEventCustomTemplate rechaza el tope de 10 vínculos", async () => {
  const { mod, models, createMessageTemplate } = await loadEventCustomService();
  models.EventWhatsappTemplate.count.mockResolvedValue(10);
  models.EventWhatsappTemplate.findAll.mockResolvedValue(
    Array.from({ length: 10 }, (_, index) => ({ slot: index + 1 })),
  );

  await expect(mod.createEventCustomTemplate({
    eventId: "evt_1",
    ownerUserId: "usr_1",
    source: "blank",
    body: WIZARD_BODY,
    headerType: "none",
    slotMappings: LOCKED_MAPPINGS,
  })).rejects.toMatchObject({ status: 400 });

  expect(createMessageTemplate).not.toHaveBeenCalled();
  expect(models.WhatsappMessageTemplate.create).not.toHaveBeenCalled();
  expect(models.EventWhatsappTemplate.create).not.toHaveBeenCalled();
});

test("attachEventTemplate vincula sin clonar y rechaza el mismo templateId", async () => {
  const { mod, models, createMessageTemplate } = await loadEventCustomService();
  const library = libraryTemplate({
    id: "tpl_lib",
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    isWabaDefault: false,
  });
  models.WhatsappMessageTemplate.findOne.mockResolvedValue(library);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([{ slot: 1 }]);
  models.EventWhatsappTemplate.count.mockResolvedValue(1);
  models.EventWhatsappTemplate.findOne.mockResolvedValue(null);

  const result = await mod.attachEventTemplate({
    eventId: "evt_1",
    ownerUserId: "usr_1",
    templateId: "tpl_lib",
  });

  expect(createMessageTemplate).not.toHaveBeenCalled();
  expect(models.WhatsappMessageTemplate.create).not.toHaveBeenCalled();
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      eventId: "evt_1",
      whatsappMessageTemplateId: "tpl_lib",
      slot: 2,
      isCampaign: false,
    }),
  );
  expect(result.link.whatsappMessageTemplateId).toBe("tpl_lib");

  models.EventWhatsappTemplate.findOne.mockResolvedValue({
    id: "link_dup",
    eventId: "evt_1",
    whatsappMessageTemplateId: "tpl_lib",
  });

  await expect(mod.attachEventTemplate({
    eventId: "evt_1",
    ownerUserId: "usr_1",
    templateId: "tpl_lib",
  })).rejects.toMatchObject({ status: 409 });
});

test("submit acepta slot 3 y rechaza slot 0", async () => {
  const updateMessageTemplate = jest.fn(async () => ({ id: "meta_3" }));
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      ...ownerMetaMocks(),
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: (token) => token || "sys_tok",
        ensurePlatformCanManageWaba: jest.fn(async () => ({ shared: true, assigned: true })),
        createMessageTemplate: jest.fn(),
        updateMessageTemplate,
        uploadResumableHeader: jest.fn(),
        deleteMessageTemplate: jest.fn(),
      }),
    },
  });
  const event = fakeEvent({ id: "evt_1", ownerId: "usr_1" });
  const template = {
    id: "tpl_3",
    metaTemplateId: "meta_3",
    wabaId: "waba_1",
    name: "alanna_pc_3",
    language: "es_MX",
    category: "MARKETING",
    headerType: "none",
    status: "APPROVED",
    isWabaDefault: false,
    update: jest.fn(async function update(patch) {
      Object.assign(this, patch);
      return this;
    }),
  };
  const pivot = {
    eventId: event.id,
    slot: 3,
    whatsappMessageTemplateId: template.id,
    template,
    update: jest.fn(async function update(patch) {
      Object.assign(this, patch);
      return this;
    }),
  };
  models.Event.findOne.mockResolvedValue(event);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([pivot]);
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.findOne.mockResolvedValue(pivot);
  models.EventWhatsappTemplate.count.mockResolvedValue(1);

  const result = await mod.submitEventTemplate({
    eventId: event.id,
    ownerUserId: "usr_1",
    slot: 3,
    body: WIZARD_BODY,
    headerType: "none",
    slotMappings: {},
    isCampaign: false,
  });

  expect(updateMessageTemplate).toHaveBeenCalledTimes(1);
  expect(result).toBe(template);

  await expect(mod.submitEventTemplate({
    eventId: event.id,
    ownerUserId: "usr_1",
    slot: 0,
    body: WIZARD_BODY,
    headerType: "none",
    slotMappings: {},
    isCampaign: false,
  })).rejects.toMatchObject({
    status: 400,
    message: "El slot de plantilla no es válido.",
  });
});

test("submit hace fork cuando la HSM es default aunque solo tenga un pivot", async () => {
  const createMessageTemplate = jest.fn(async () => ({ id: "meta_fork" }));
  const updateMessageTemplate = jest.fn();
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      ...ownerMetaMocks(),
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        ensurePlatformCanManageWaba: jest.fn(async () => ({ shared: true, assigned: true })),
        createMessageTemplate,
        updateMessageTemplate,
        uploadResumableHeader: jest.fn(),
        deleteMessageTemplate: jest.fn(),
      }),
    },
  });
  const event = fakeEvent({ id: "evt_1", ownerId: "usr_1" });
  const template = {
    id: "tpl_default",
    metaTemplateId: "meta_default",
    wabaId: "waba_1",
    name: "alanna_pc_default",
    language: "es_MX",
    category: "MARKETING",
    headerType: "none",
    status: "APPROVED",
    isWabaDefault: true,
    displayName: "Invitación formal",
  };
  const pivot = {
    eventId: event.id,
    slot: 1,
    whatsappMessageTemplateId: template.id,
    template,
    update: jest.fn(async function update(patch) {
      Object.assign(this, patch);
      return this;
    }),
  };
  models.Event.findOne.mockResolvedValue(event);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([pivot]);
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.findOne.mockResolvedValue(pivot);
  models.EventWhatsappTemplate.count.mockResolvedValue(1);
  models.WhatsappMessageTemplate.create.mockImplementation(async (row) => ({
    ...row,
    id: "tpl_fork",
    update: jest.fn(),
  }));

  const result = await mod.submitEventTemplate({
    eventId: event.id,
    ownerUserId: "usr_1",
    slot: 1,
    body: WIZARD_BODY,
    headerType: "none",
    slotMappings: {},
    isCampaign: false,
  });

  expect(updateMessageTemplate).not.toHaveBeenCalled();
  expect(createMessageTemplate).toHaveBeenCalledTimes(1);
  expect(models.WhatsappMessageTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      metaTemplateId: "meta_fork",
      clonedFromId: "tpl_default",
      isWabaDefault: false,
      status: "PENDING",
      displayName: "Invitación formal",
    }),
  );
  expect(result.id).toBe("tpl_fork");
});

test("submit fork crea la HSM en el WABA activo, no en el WABA viejo de la plantilla", async () => {
  const createMessageTemplate = jest.fn(async () => ({ id: "meta_fork" }));
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      ...ownerMetaMocks("waba_new"),
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: (token) => token || "tok",
        ensurePlatformCanManageWaba: jest.fn(async () => ({ shared: true, assigned: true })),
        createMessageTemplate,
        updateMessageTemplate: jest.fn(),
        uploadResumableHeader: jest.fn(),
        deleteMessageTemplate: jest.fn(),
      }),
    },
  });
  const event = fakeEvent({ id: "evt_1", ownerId: "usr_1" });
  const template = {
    id: "tpl_default",
    metaTemplateId: "meta_default",
    wabaId: "waba_old",
    name: "alanna_pc_default",
    language: "es_MX",
    category: "MARKETING",
    headerType: "none",
    status: "APPROVED",
    isWabaDefault: true,
    displayName: "Invitación formal",
  };
  const pivot = {
    eventId: event.id,
    slot: 1,
    whatsappMessageTemplateId: template.id,
    template,
    update: jest.fn(async function update(patch) {
      Object.assign(this, patch);
      return this;
    }),
  };
  models.Event.findOne.mockResolvedValue(event);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([pivot]);
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.findOne.mockResolvedValue(pivot);
  models.EventWhatsappTemplate.count.mockResolvedValue(1);
  models.WhatsappMessageTemplate.create.mockImplementation(async (row) => ({
    ...row,
    id: "tpl_fork",
    update: jest.fn(),
  }));

  await mod.submitEventTemplate({
    eventId: event.id,
    ownerUserId: "usr_1",
    slot: 1,
    body: WIZARD_BODY,
    headerType: "none",
    slotMappings: {},
    isCampaign: false,
  });

  expect(createMessageTemplate).toHaveBeenCalledWith(expect.objectContaining({
    wabaId: "waba_new",
    token: "tok",
  }));
  expect(models.WhatsappMessageTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({ wabaId: "waba_new" }),
  );
});

test("submit fork usa displayName del payload si viene", async () => {
  const createMessageTemplate = jest.fn(async () => ({ id: "meta_fork" }));
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      ...ownerMetaMocks(),
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        ensurePlatformCanManageWaba: jest.fn(async () => ({ shared: true, assigned: true })),
        createMessageTemplate,
        updateMessageTemplate: jest.fn(),
        uploadResumableHeader: jest.fn(),
        deleteMessageTemplate: jest.fn(),
      }),
    },
  });
  const event = fakeEvent({ id: "evt_1", ownerId: "usr_1" });
  const template = {
    id: "tpl_default",
    metaTemplateId: "meta_default",
    wabaId: "waba_1",
    name: "alanna_pc_default",
    language: "es_MX",
    category: "MARKETING",
    headerType: "none",
    status: "APPROVED",
    isWabaDefault: true,
    displayName: "Invitación formal",
  };
  const pivot = {
    eventId: event.id,
    slot: 1,
    whatsappMessageTemplateId: template.id,
    template,
    update: jest.fn(async function update(patch) {
      Object.assign(this, patch);
      return this;
    }),
  };
  models.Event.findOne.mockResolvedValue(event);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([pivot]);
  models.WhatsappMessageTemplate.findAll.mockResolvedValue([]);
  models.EventWhatsappTemplate.findOne.mockResolvedValue(pivot);
  models.EventWhatsappTemplate.count.mockResolvedValue(1);
  models.WhatsappMessageTemplate.create.mockImplementation(async (row) => ({
    ...row,
    id: "tpl_fork",
    update: jest.fn(),
  }));

  await mod.submitEventTemplate({
    eventId: event.id,
    ownerUserId: "usr_1",
    slot: 1,
    body: WIZARD_BODY,
    headerType: "none",
    slotMappings: {},
    isCampaign: false,
    displayName: "  Copia del evento  ",
  });

  expect(models.WhatsappMessageTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      clonedFromId: "tpl_default",
      displayName: "Copia del evento",
    }),
  );
});
