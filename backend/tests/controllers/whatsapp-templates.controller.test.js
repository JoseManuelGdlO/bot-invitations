import { jest } from "@jest/globals";
import {
  callHandler,
  createMockReq,
  fakeEvent,
  loadWithMocks,
  PERMS,
} from "../helpers/controller.js";

function template(overrides = {}) {
  return {
    id: "tpl_1",
    name: "alanna_pc_abcd1234_1",
    metaTemplateId: "meta_tpl_1",
    language: "es_MX",
    category: "MARKETING",
    headerType: "none",
    headerFileName: null,
    status: "PENDING",
    rejectedReason: null,
    components: [{ type: "BODY", text: "Hola {{1}}, tienes {{2}} pases." }],
    ...overrides,
  };
}

function link(overrides = {}) {
  return {
    id: "link_1",
    slot: 1,
    isCampaign: true,
    slotMappings: {
      "1": { type: "field", key: "nombre" },
      "2": { type: "field", key: "numero_invitados" },
    },
    template: template(),
    ...overrides,
  };
}

describe("whatsapp-templates.controller", () => {
  let controller;
  let createWizardTemplates;
  let ensureEventWhatsappTemplates;
  let listEventWhatsappTemplates;
  let submitEventTemplate;
  let setCampaignSlot;
  let resolveActiveWhatsappMetaByOwner;
  let requireEvent;
  let requirePermission;

  beforeEach(async () => {
    createWizardTemplates = jest.fn(async () => [template()]);
    ensureEventWhatsappTemplates = jest.fn(async () => ({ links: [] }));
    listEventWhatsappTemplates = jest.fn(async () => [link()]);
    submitEventTemplate = jest.fn(async () => template());
    setCampaignSlot = jest.fn(async () => undefined);
    resolveActiveWhatsappMetaByOwner = jest.fn(async () => ({
      credentials: { wabaId: "waba_1", accessToken: "owner-token" },
    }));
    requireEvent = jest.fn(async () => fakeEvent({ id: "evt_1", ownerId: "usr_owner_1" }));
    requirePermission = jest.fn(async () => true);

    ({ mod: controller } = await loadWithMocks("src/controllers/whatsapp-templates.controller.js", {
      extraMocks: {
        "src/services/access.service.js": () => ({
          requireEvent,
          requirePermission,
          PERMS,
        }),
        "src/services/whatsapp-meta.service.js": () => ({
          resolveActiveWhatsappMetaByOwner,
        }),
        "src/services/whatsapp-templates.service.js": () => ({
          createWizardTemplates,
          ensureEventWhatsappTemplates,
          listEventWhatsappTemplates,
          submitEventTemplate,
          setCampaignSlot,
        }),
      },
    }));
  });

  test("POST wizard crea plantillas desde multipart y responde 201", async () => {
    const payload = {
      templates: [{
        slot: 1,
        headerType: "document",
        body: "Hola {{1}}, tienes {{2}} pases.",
        isCampaign: true,
      }],
    };
    const uploaded = {
      buffer: Buffer.from("pdf"),
      originalname: "invitacion.pdf",
      mimetype: "application/pdf",
      size: 3,
    };

    const { res } = await callHandler(controller.postWizardTemplates, {
      req: createMockReq({
        body: { payload: JSON.stringify(payload) },
        files: { header_1: [uploaded] },
      }),
    });

    expect(resolveActiveWhatsappMetaByOwner).toHaveBeenCalledWith("usr_test_1");
    expect(createWizardTemplates).toHaveBeenCalledWith({
      ownerUserId: "usr_test_1",
      wabaId: "waba_1",
      plannerAccessToken: "owner-token",
      templates: [{
        ...payload.templates[0],
        slotMappings: {
          "1": { type: "field", key: "nombre" },
          "2": { type: "field", key: "numero_invitados" },
        },
        headerFile: {
          buffer: uploaded.buffer,
          fileName: "invitacion.pdf",
          mime: "application/pdf",
          size: 3,
        },
      }],
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      templates: [{
        id: "tpl_1",
        slot: 1,
        isCampaign: true,
        slotMappings: {
          "1": { type: "field", key: "nombre" },
          "2": { type: "field", key: "numero_invitados" },
        },
        template: expect.objectContaining({
          id: "tpl_1",
          name: "alanna_pc_abcd1234_1",
          body: "Hola {{1}}, tienes {{2}} pases.",
        }),
      }],
    });
  });

  test("POST wizard acepta JSON sin archivo", async () => {
    const templates = [{
      slot: 1,
      headerType: "none",
      body: "Hola {{1}}, tienes {{2}} pases.",
      isCampaign: true,
    }];
    await callHandler(controller.postWizardTemplates, {
      req: createMockReq({ body: { templates } }),
    });
    expect(createWizardTemplates).toHaveBeenCalledWith(
      expect.objectContaining({
        templates: [expect.objectContaining({ ...templates[0], headerFile: undefined })],
      }),
    );
  });

  test("POST wizard responde 400 sin templates", async () => {
    const { res } = await callHandler(controller.postWizardTemplates, {
      req: createMockReq({ body: {} }),
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(createWizardTemplates).not.toHaveBeenCalled();
  });

  test("GET asegura y lista plantillas del evento con permiso CONFIG_AI", async () => {
    const { res } = await callHandler(controller.getEventWhatsappTemplates, {
      req: createMockReq({ params: { eventId: "evt_1" } }),
    });
    expect(requirePermission).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ id: "evt_1" }),
      PERMS.CONFIG_AI,
    );
    expect(ensureEventWhatsappTemplates).toHaveBeenCalledWith(expect.objectContaining({ id: "evt_1" }));
    expect(listEventWhatsappTemplates).toHaveBeenCalledWith("evt_1");
    expect(res.json).toHaveBeenCalledWith({
      templates: [expect.objectContaining({
        id: "link_1",
        slot: 1,
        template: expect.objectContaining({ body: "Hola {{1}}, tienes {{2}} pases." }),
      })],
    });
  });

  test("PUT envía una plantilla de slot con payload multipart", async () => {
    const uploaded = {
      buffer: Buffer.from("image"),
      originalname: "portada.jpg",
      mimetype: "image/jpeg",
      size: 5,
    };
    const payload = {
      body: "Hola {{1}}, tienes {{2}} pases.",
      headerType: "image",
      slotMappings: link().slotMappings,
      isCampaign: true,
    };
    const { res } = await callHandler(controller.putEventWhatsappTemplate, {
      req: createMockReq({
        params: { eventId: "evt_1", slot: "2" },
        body: { payload: JSON.stringify(payload) },
        files: { header: [uploaded] },
      }),
    });
    expect(submitEventTemplate).toHaveBeenCalledWith({
      eventId: "evt_1",
      ownerUserId: "usr_owner_1",
      slot: "2",
      ...payload,
      headerFile: {
        buffer: uploaded.buffer,
        fileName: "portada.jpg",
        mime: "image/jpeg",
        size: 5,
      },
    });
    expect(res.json).toHaveBeenCalledWith({
      template: expect.objectContaining({
        slot: 2,
        isCampaign: true,
        template: expect.objectContaining({ id: "tpl_1" }),
      }),
    });
  });

  test("PATCH selecciona el slot de campaña", async () => {
    const { res } = await callHandler(controller.patchEventWhatsappTemplate, {
      req: createMockReq({
        params: { eventId: "evt_1", slot: "2" },
        body: { isCampaign: true },
      }),
    });
    expect(setCampaignSlot).toHaveBeenCalledWith({ eventId: "evt_1", slot: 2 });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});
