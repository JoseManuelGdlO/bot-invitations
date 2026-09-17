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
  let models;
  let createWizardTemplates;
  let ensureEventWhatsappTemplates;
  let listEventWhatsappTemplates;
  let listOwnerTemplates;
  let deleteOwnerTemplate;
  let submitEventTemplate;
  let submitOwnerCustomTemplate;
  let createEventCustomTemplate;
  let attachEventTemplate;
  let setCampaignSlot;
  let resolveActiveWhatsappMetaByOwner;
  let requireEvent;
  let requirePermission;

  beforeEach(async () => {
    createWizardTemplates = jest.fn(async () => ({
      template: template(),
      slotMappings: {
        "1": { type: "field", key: "nombre" },
        "2": { type: "field", key: "numero_invitados" },
      },
    }));
    ensureEventWhatsappTemplates = jest.fn(async () => ({ links: [] }));
    listEventWhatsappTemplates = jest.fn(async () => [link()]);
    listOwnerTemplates = jest.fn(async () => []);
    deleteOwnerTemplate = jest.fn(async () => undefined);
    submitEventTemplate = jest.fn(async () => template());
    submitOwnerCustomTemplate = jest.fn(async () => template({
      isWabaDefault: false,
      headerFileName: "portada.jpg",
      displayName: "Invitación con mesa",
      slotMappings: link().slotMappings,
      usage: {
        eventCount: 2,
        campaignEventCount: 1,
        events: [{ id: "evt_1", name: "Boda Ana" }],
      },
    }));
    createEventCustomTemplate = jest.fn(async () => ({
      template: template({ isWabaDefault: false }),
      link: link({ slot: 2, isCampaign: false }),
    }));
    attachEventTemplate = jest.fn(async () => ({
      template: template({ isWabaDefault: false }),
      link: link({ slot: 2, isCampaign: false, template: template({ id: "tpl_lib" }) }),
    }));
    setCampaignSlot = jest.fn(async () => undefined);
    resolveActiveWhatsappMetaByOwner = jest.fn(async () => ({
      credentials: { wabaId: "waba_1", accessToken: "owner-token" },
    }));
    requireEvent = jest.fn(async () => fakeEvent({ id: "evt_1", ownerId: "usr_owner_1" }));
    requirePermission = jest.fn(async () => true);

    ({ mod: controller, models } = await loadWithMocks("src/controllers/whatsapp-templates.controller.js", {
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
          listOwnerTemplates,
          deleteOwnerTemplate,
          submitEventTemplate,
          submitOwnerCustomTemplate,
          createEventCustomTemplate,
          attachEventTemplate,
          setCampaignSlot,
        }),
      },
    }));
  });

  test("POST wizard crea plantillas desde multipart y responde 201", async () => {
    const payload = {
      displayName: "Invitación formal",
      headerType: "document",
      body: "Hola {{1}}, tienes {{2}} pases.",
      slotMappings: {
        "1": { type: "field", key: "nombre" },
        "2": { type: "field", key: "numero_invitados" },
      },
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
      displayName: "Invitación formal",
      headerType: "document",
      body: payload.body,
      slotMappings: payload.slotMappings,
      headerFile: {
        buffer: uploaded.buffer,
        fileName: "invitacion.pdf",
        mime: "application/pdf",
        size: 3,
      },
    });
    expect(models.Event.findOne).not.toHaveBeenCalled();
    expect(listEventWhatsappTemplates).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      templates: [{
        id: null,
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

  test("POST wizard acepta JSON plano sin archivo", async () => {
    const payload = {
      displayName: "Invitación formal",
      headerType: "none",
      body: "Hola {{1}}, tienes {{2}} pases.",
      slotMappings: {
        "1": { type: "field", key: "nombre" },
        "2": { type: "field", key: "numero_invitados" },
      },
    };
    const { res } = await callHandler(controller.postWizardTemplates, {
      req: createMockReq({ body: payload }),
    });
    expect(createWizardTemplates).toHaveBeenCalledWith({
      ownerUserId: "usr_test_1",
      wabaId: "waba_1",
      plannerAccessToken: "owner-token",
      displayName: "Invitación formal",
      headerType: "none",
      body: payload.body,
      slotMappings: payload.slotMappings,
      headerFile: undefined,
    });
    expect(listEventWhatsappTemplates).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      templates: [expect.objectContaining({
        id: null,
        slot: 1,
        isCampaign: true,
        template: expect.objectContaining({ id: "tpl_1" }),
      })],
    });
  });

  test("POST wizard acepta templates[] de un item como compatibilidad", async () => {
    const templates = [{
      slot: 1,
      headerType: "none",
      body: "Hola {{1}}, tienes {{2}} pases.",
      isCampaign: true,
    }];
    const { res } = await callHandler(controller.postWizardTemplates, {
      req: createMockReq({ body: { templates } }),
    });
    expect(createWizardTemplates).toHaveBeenCalledWith(
      expect.objectContaining({
        headerType: "none",
        body: templates[0].body,
        headerFile: undefined,
      }),
    );
    expect(createWizardTemplates.mock.calls[0][0]).not.toHaveProperty("templates");
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("POST wizard ignora id falsificado en el JSON", async () => {
    const { res } = await callHandler(controller.postWizardTemplates, {
      req: createMockReq({
        body: {
          id: "forged_link",
          headerType: "none",
          body: "Hola {{1}}, pases {{2}}",
        },
      }),
    });

    expect(models.Event.findOne).not.toHaveBeenCalled();
    expect(listEventWhatsappTemplates).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      templates: [expect.objectContaining({ id: null })],
    });
  });

  test("POST wizard no expone mappings bloqueados falsificados", async () => {
    const { res } = await callHandler(controller.postWizardTemplates, {
      req: createMockReq({
        body: {
          headerType: "none",
          body: "Hola {{1}}, tienes {{2}} pases.",
          slotMappings: {
            "1": { type: "literal", value: "nombre falso" },
            "2": { type: "field", key: "otro_campo" },
          },
        },
      }),
    });

    expect(res.json).toHaveBeenCalledWith({
      templates: [expect.objectContaining({
        id: null,
        slotMappings: {
          "1": { type: "field", key: "nombre" },
          "2": { type: "field", key: "numero_invitados" },
        },
      })],
    });
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
        template: expect.objectContaining({
          body: "Hola {{1}}, tienes {{2}} pases.",
          displayName: null,
          isWabaDefault: false,
        }),
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
      displayName: "Nombre en evento",
    };
    models.EventWhatsappTemplate.findOne.mockResolvedValue(
      link({ id: "link_2", slot: 2, isCampaign: true }),
    );
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
      isCampaign: undefined,
      headerFile: {
        buffer: uploaded.buffer,
        fileName: "portada.jpg",
        mime: "image/jpeg",
        size: 5,
      },
    });
    expect(res.json).toHaveBeenCalledWith({
      template: expect.objectContaining({
        id: "link_2",
        slot: 2,
        isCampaign: true,
        template: expect.objectContaining({ id: "tpl_1" }),
      }),
    });
  });

  test("PATCH selecciona el slot de campaña", async () => {
    models.EventWhatsappTemplate.findOne.mockResolvedValue(link({ slot: 2 }));
    const { res } = await callHandler(controller.patchEventWhatsappTemplate, {
      req: createMockReq({
        params: { eventId: "evt_1", slot: "2" },
        body: { isCampaign: true },
      }),
    });
    expect(setCampaignSlot).toHaveBeenCalledWith({ eventId: "evt_1", slot: 2 });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test("PATCH acepta slot 3 si el pivot existe", async () => {
    models.EventWhatsappTemplate.findOne.mockResolvedValue(link({ slot: 3 }));
    const { res } = await callHandler(controller.patchEventWhatsappTemplate, {
      req: createMockReq({
        params: { eventId: "evt_1", slot: "3" },
        body: { isCampaign: true },
      }),
    });
    expect(models.EventWhatsappTemplate.findOne).toHaveBeenCalledWith({
      where: { eventId: "evt_1", slot: 3 },
    });
    expect(setCampaignSlot).toHaveBeenCalledWith({ eventId: "evt_1", slot: 3 });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test("PATCH rechaza un slot inválido antes de cambiar la campaña", async () => {
    const { next } = await callHandler(controller.patchEventWhatsappTemplate, {
      req: createMockReq({
        params: { eventId: "evt_1", slot: "0" },
        body: { isCampaign: true },
      }),
    });

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(models.EventWhatsappTemplate.findOne).not.toHaveBeenCalled();
    expect(setCampaignSlot).not.toHaveBeenCalled();
  });

  test("POST evento crea personalizada con header multipart y CONFIG_AI", async () => {
    const uploaded = {
      buffer: Buffer.from("image"),
      originalname: "portada.jpg",
      mimetype: "image/jpeg",
      size: 5,
    };
    const payload = {
      source: "blank",
      displayName: "Invitación con mesa",
      body: "Hola {{1}}, tienes {{2}} pases reservados. Tu mesa es la {{3}}. Confirma por este chat, por favor.",
      headerType: "image",
      slotMappings: {
        "1": { type: "field", key: "nombre" },
        "2": { type: "field", key: "numero_invitados" },
        "3": { type: "field", key: "mesa" },
      },
    };

    const { res } = await callHandler(controller.postEventWhatsappTemplate, {
      req: createMockReq({
        params: { eventId: "evt_1" },
        body: { payload: JSON.stringify(payload) },
        files: { header: [uploaded] },
      }),
    });

    expect(requirePermission).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ id: "evt_1" }),
      PERMS.CONFIG_AI,
    );
    expect(createEventCustomTemplate).toHaveBeenCalledWith({
      eventId: "evt_1",
      ownerUserId: "usr_owner_1",
      source: "blank",
      templateId: undefined,
      displayName: "Invitación con mesa",
      body: payload.body,
      headerType: "image",
      slotMappings: payload.slotMappings,
      headerFile: {
        buffer: uploaded.buffer,
        fileName: "portada.jpg",
        mime: "image/jpeg",
        size: 5,
      },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      template: expect.objectContaining({
        slot: 2,
        isCampaign: false,
        template: expect.objectContaining({ id: "tpl_1" }),
      }),
    });
  });

  test("POST attach vincula una HSM de biblioteca sin clonar", async () => {
    const { res } = await callHandler(controller.attachEventWhatsappTemplate, {
      req: createMockReq({
        params: { eventId: "evt_1" },
        body: { templateId: "tpl_lib" },
      }),
    });

    expect(requirePermission).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ id: "evt_1" }),
      PERMS.CONFIG_AI,
    );
    expect(attachEventTemplate).toHaveBeenCalledWith({
      eventId: "evt_1",
      ownerUserId: "usr_owner_1",
      templateId: "tpl_lib",
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      template: expect.objectContaining({
        slot: 2,
        template: expect.objectContaining({ id: "tpl_lib" }),
      }),
    });
  });

  test("PATCH responde 404 si el slot no tiene pivot", async () => {
    const { next } = await callHandler(controller.patchEventWhatsappTemplate, {
      req: createMockReq({
        params: { eventId: "evt_1", slot: "2" },
        body: { isCampaign: true },
      }),
    });

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    expect(setCampaignSlot).not.toHaveBeenCalled();
  });

  test("GET biblioteca serializa usage y displayName persistido", async () => {
    const createdAt = new Date("2026-01-02T00:00:00.000Z");
    listOwnerTemplates.mockResolvedValue([{
      id: "tpl_1",
      displayName: "Invitación formal",
      name: "alanna_pc_ab12cd34_1",
      status: "APPROVED",
      headerType: "none",
      components: [{ type: "BODY", text: "Hola {{1}}, tienes {{2}} pases." }],
      isWabaDefault: true,
      rejectedReason: null,
      createdAt,
      usage: {
        eventCount: 3,
        campaignEventCount: 2,
        events: [{ id: "evt_1", name: "Boda Ana" }],
      },
    }]);

    const { res } = await callHandler(controller.getOwnerWhatsappTemplates, {
      req: createMockReq(),
    });

    expect(res.json).toHaveBeenCalledWith({
      templates: [expect.objectContaining({
        displayName: "Invitación formal",
        isWabaDefault: true,
      })],
    });
  });

  test("GET biblioteca serializa usage y displayName null", async () => {
    const createdAt = new Date("2026-01-02T00:00:00.000Z");
    listOwnerTemplates.mockResolvedValue([{
      id: "tpl_1",
      name: "alanna_pc_ab12cd34_1",
      status: "APPROVED",
      headerType: "none",
      components: [{ type: "BODY", text: "Hola {{1}}, tienes {{2}} pases." }],
      isWabaDefault: true,
      rejectedReason: null,
      createdAt,
      usage: {
        eventCount: 3,
        campaignEventCount: 2,
        events: [{ id: "evt_1", name: "Boda Ana" }],
      },
    }]);

    const { res } = await callHandler(controller.getOwnerWhatsappTemplates, {
      req: createMockReq(),
    });

    expect(requireEvent).not.toHaveBeenCalled();
    expect(listOwnerTemplates).toHaveBeenCalledWith("usr_test_1");
    expect(res.json).toHaveBeenCalledWith({
      templates: [{
        id: "tpl_1",
        displayName: null,
        name: "alanna_pc_ab12cd34_1",
        status: "APPROVED",
        headerType: "none",
        headerFileName: null,
        body: "Hola {{1}}, tienes {{2}} pases.",
        isWabaDefault: true,
        rejectedReason: null,
        createdAt,
        slotMappings: {},
        usage: {
          eventCount: 3,
          campaignEventCount: 2,
          events: [{ id: "evt_1", name: "Boda Ana" }],
        },
      }],
    });
  });

  test("GET biblioteca serializa headerFileName", async () => {
    listOwnerTemplates.mockResolvedValue([{
      id: "tpl_1",
      displayName: "Invitación formal",
      name: "alanna_pc_ab12cd34_1",
      status: "APPROVED",
      headerType: "document",
      headerFileName: "invitacion.pdf",
      components: [{ type: "BODY", text: "Hola {{1}}, tienes {{2}} pases." }],
      isWabaDefault: false,
      rejectedReason: null,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      slotMappings: {},
      usage: {
        eventCount: 0,
        campaignEventCount: 0,
        events: [],
      },
    }]);

    const { res } = await callHandler(controller.getOwnerWhatsappTemplates, {
      req: createMockReq(),
    });

    expect(res.json).toHaveBeenCalledWith({
      templates: [expect.objectContaining({
        headerFileName: "invitacion.pdf",
      })],
    });
  });

  test("GET biblioteca serializa slotMappings del default", async () => {
    const slotMappings = {
      "1": { type: "field", key: "nombre" },
      "2": { type: "field", key: "numero_invitados" },
      "3": { type: "field", key: "evento" },
    };
    listOwnerTemplates.mockResolvedValue([{
      id: "tpl_1",
      displayName: "Invitación con fecha",
      name: "alanna_pc_ab12cd34_1",
      status: "APPROVED",
      headerType: "none",
      components: [{ type: "BODY", text: "Hola {{1}}, te invitamos a {{3}} con {{2}} pases." }],
      isWabaDefault: true,
      rejectedReason: null,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      slotMappings,
      usage: {
        eventCount: 1,
        campaignEventCount: 1,
        events: [{ id: "evt_1", name: "Boda Ana" }],
      },
    }]);

    const { res } = await callHandler(controller.getOwnerWhatsappTemplates, {
      req: createMockReq(),
    });

    expect(res.json).toHaveBeenCalledWith({
      templates: [expect.objectContaining({
        isWabaDefault: true,
        slotMappings,
      })],
    });
  });

  test("DELETE biblioteca llama al servicio y responde 204", async () => {
    const { res } = await callHandler(controller.deleteOwnerWhatsappTemplate, {
      req: createMockReq({ params: { id: "tpl_1" } }),
    });

    expect(requireEvent).not.toHaveBeenCalled();
    expect(deleteOwnerTemplate).toHaveBeenCalledWith({
      ownerUserId: "usr_test_1",
      templateId: "tpl_1",
    });
    expect(res.status).toHaveBeenCalledWith(204);
  });

  test("DELETE biblioteca propaga 409 de campaña activa", async () => {
    const err = Object.assign(new Error("campaña en curso"), { status: 409 });
    deleteOwnerTemplate.mockRejectedValue(err);

    const { next } = await callHandler(controller.deleteOwnerWhatsappTemplate, {
      req: createMockReq({ params: { id: "tpl_1" } }),
    });

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
  });

  test("PUT biblioteca llama al servicio in situ y serializa headerFileName", async () => {
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
      displayName: "Invitación con mesa",
    };

    const { res } = await callHandler(controller.putOwnerWhatsappTemplate, {
      req: createMockReq({
        params: { id: "tpl_custom" },
        body: { payload: JSON.stringify(payload) },
        files: { header: [uploaded] },
      }),
    });

    expect(requireEvent).not.toHaveBeenCalled();
    expect(submitOwnerCustomTemplate).toHaveBeenCalledWith({
      ownerUserId: "usr_test_1",
      templateId: "tpl_custom",
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
        id: "tpl_1",
        displayName: "Invitación con mesa",
        headerFileName: "portada.jpg",
        isWabaDefault: false,
      }),
    });
  });
});
