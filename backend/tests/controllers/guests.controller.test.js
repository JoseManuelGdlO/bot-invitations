import fs from "node:fs/promises";
import path from "node:path";
import { jest } from "@jest/globals";
import JSZip from "jszip";
import XLSX from "xlsx";
import { env } from "../../src/config/env.js";
import { stageSpreadsheet } from "../../src/services/import-staging.service.js";
import { callHandler, createMockReq, loadWithMocks, fakeEvent, fakeGuest, fakeUser, PERMS } from "../helpers/controller.js";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("guests.controller", () => {
  let controller;
  let models;
  let requireEvent;
  let userEventIds;
  let assertCanAddGuests;
  let logActivity;
  let deliverAiMessage;
  let resolveReminderText;
  let resolveCampaignSendContext;
  let resolvePurposeSendContext;

  beforeEach(async () => {
    requireEvent = jest.fn(async () => fakeEvent());
    userEventIds = jest.fn(async () => ["evt_1"]);
    assertCanAddGuests = jest.fn(async () => undefined);
    logActivity = jest.fn(async () => undefined);
    deliverAiMessage = jest.fn(async () => undefined);
    resolveReminderText = jest.fn(async () => "Recordatorio de prueba");
    resolveCampaignSendContext = jest.fn(async () => ({
      template: {
        name: "alanna_pc_aa_1",
        components: [{ type: "BODY", text: "Hola {{1}}, tienes {{2}} pases." }],
      },
      link: {},
      hsmTemplateName: "alanna_pc_aa_1",
      hsmParamsFor: jest.fn(async () => ["Luis", "2"]),
      hsmHeaderDocument: null,
      hsmHeaderImage: null,
    }));
    resolvePurposeSendContext = jest.fn(async () => ({
      template: {
        name: "alanna_rm_aa_1",
        components: [{ type: "BODY", text: "Hola {{1}}, tienes {{2}} pases el {{3}}." }],
      },
      link: {},
      hsmTemplateName: "alanna_rm_aa_1",
      hsmParamsFor: jest.fn(async () => ["Luis", "2", "mayo"]),
      hsmHeaderDocument: null,
      hsmHeaderImage: null,
    }));

    ({ mod: controller, models } = await loadWithMocks("src/controllers/guests.controller.js", {
      extraMocks: {
        "src/services/access.service.js": () => ({
          requireEvent,
          userEventIds,
          requirePermission: jest.fn(async () => true),
          hasEventPermission: jest.fn(async () => true),
          PERMS,
        }),
        "src/services/activity.service.js": () => ({ logActivity }),
        "src/services/outbound.worker.js": () => ({ 
          enqueueJob: jest.fn(async () => undefined) 
        }),
        "src/services/plans.service.js": () => ({
          assertCanAddGuestsForEvent: assertCanAddGuests,
          assertCanSendInvitations: jest.fn(() => undefined),
        }),
        "src/services/guest-message.service.js": () => ({ deliverAiMessage }),
        "src/services/templates.service.js": () => ({
          findTemplate: jest.fn(async () => null),
          resolveOpeningParts: jest.fn(async () => ({})),
          resolveReminderText,
          renderTemplate: jest.fn((body) => body),
          resolveOpeningText: jest.fn(async () => "opening"),
          resolveSeguimientoText: jest.fn(async () => "seguimiento"),
          composeConstructorMessage: jest.fn(() => ""),
        }),
        "src/services/whatsapp-templates.service.js": () => ({
          resolveCampaignSendContext,
          resolvePurposeSendContext,
        }),
        "src/services/integration-resolver.service.js": () => ({
          assertWhatsappReady: jest.fn(async () => undefined),
        }),
        "src/services/export.service.js": () => ({
          guestsToRows: jest.fn((guests) => guests || []),
          toCsv: jest.fn(async () => Buffer.from("csv,data")),
          toPdf: jest.fn(async () => Buffer.from("%PDF-mock")),
          toXlsx: jest.fn(async () => Buffer.from("xlsx-mock")),
        }),
      },
    }));

    models.Event.findByPk.mockResolvedValue(fakeEvent());
    models.Guest.findOne.mockResolvedValue(fakeGuest());
    models.Guest.create.mockImplementation(async (data) => fakeGuest(data));
    models.AiConfig.findOne.mockResolvedValue(null);
  });

  test("createGuest 400 si invited es negativo", async () => {
    const { res } = await callHandler(controller.createGuest, {
      req: createMockReq({
        params: { eventId: "boda-ana" },
        body: { rep: "Luis", phone: "5511111111", invited: -2 },
      }),
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(models.Guest.create).not.toHaveBeenCalled();
  });

  test("updateGuest 400 si invited es negativo", async () => {
    const { res } = await callHandler(controller.updateGuest, {
      req: createMockReq({
        user: fakeUser(),
        params: { guestId: "gst_1" },
        body: { invited: -1 },
      }),
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "El número de invitados debe ser al menos 1." }),
    );
  });

  test("createGuest 400 sin teléfono", async () => {
    const { res } = await callHandler(controller.createGuest, {
      req: createMockReq({ params: { eventId: "boda-ana" }, body: { rep: "Luis" } }),
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("createGuest 201", async () => {
    const guest = fakeGuest({ rep: "Luis Pérez", phone: "5511111111", invited: 2 });
    models.Guest.create.mockResolvedValue(guest);

    const { res } = await callHandler(controller.createGuest, {
      req: createMockReq({
        user: fakeUser(),
        params: { eventId: "boda-ana" },
        body: { rep: "Luis Pérez", phone: "5511111111", invited: 2 },
      }),
    });

    expect(assertCanAddGuests).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ id: "evt_1" }), 2);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("updateGuest 404", async () => {
    models.Guest.findOne.mockResolvedValue(null);
    const { res } = await callHandler(controller.updateGuest, {
      req: createMockReq({ user: fakeUser(), params: { guestId: "missing" }, body: {} }),
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("updateGuest loguea confirmación solo si el RSVP cambió", async () => {
    const guest = fakeGuest({ status: "enviado", invited: 2, confirmed: 0 });
    models.Guest.findOne.mockResolvedValue(guest);
    await callHandler(controller.updateGuest, {
      req: createMockReq({
        user: fakeUser(),
        params: { guestId: "gst_1" },
        body: { status: "confirmado", confirmed: 2 },
      }),
    });
    expect(logActivity).toHaveBeenCalledTimes(1);
    expect(logActivity).toHaveBeenCalledWith("evt_1", "Luis Pérez confirmó 2 de 2 lugares", "confirm");

    logActivity.mockClear();
    await callHandler(controller.updateGuest, {
      req: createMockReq({
        user: fakeUser(),
        params: { guestId: "gst_1" },
        body: { notes: "mesa 4" },
      }),
    });
    expect(logActivity).not.toHaveBeenCalled();
  });

  test("updateGuest loguea rechazo cuando el RSVP pasa a no_asistira", async () => {
    const guest = fakeGuest({ status: "enviado", invited: 2, confirmed: 0 });
    models.Guest.findOne.mockResolvedValue(guest);
    await callHandler(controller.updateGuest, {
      req: createMockReq({
        user: fakeUser(),
        params: { guestId: "gst_1" },
        body: { status: "no_asistira", confirmed: 0 },
      }),
    });
    expect(logActivity).toHaveBeenCalledWith("evt_1", "Luis Pérez no podrá asistir", "reject");
  });

  test("previewImport 400 sin archivo", async () => {
    const { res } = await callHandler(controller.previewImport, {
      req: createMockReq({ params: { eventId: "boda-ana" }, file: undefined }),
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("confirmImport 400 sin mapping", async () => {
    const { res } = await callHandler(controller.confirmImport, {
      req: createMockReq({ params: { eventId: "boda-ana" }, body: {} }),
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("confirmImport reporta discarded cuando faltan nombre o teléfono", async () => {
    models.Guest.findAll.mockResolvedValue([]);
    models.Guest.create.mockImplementation(async (data) => fakeGuest(data));
    const { res } = await callHandler(controller.confirmImport, {
      req: createMockReq({
        user: fakeUser(),
        params: { eventId: "boda-ana" },
        body: {
          columns: ["Nombre", "Teléfono"],
          rows: [
            ["Luis Pérez", "5511111111"],
            ["Sin teléfono", ""],
          ],
          mapping: { Nombre: "rep", Teléfono: "phone" },
        },
      }),
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ imported: 1, skipped: 0, discarded: 1 }),
    );
  });

  test("confirmImport crea al invitado aunque el enlace de imagen no sea público", async () => {
    models.Guest.findAll.mockResolvedValue([]);
    models.Guest.create.mockImplementation(async (data) => fakeGuest(data));
    const { res } = await callHandler(controller.confirmImport, {
      req: createMockReq({
        user: fakeUser(),
        params: { eventId: "boda-ana" },
        body: {
          columns: ["Nombre", "Teléfono", "Imagen"],
          rows: [["Luis Pérez", "5511111111", "https://127.0.0.1/qr.png"]],
          mapping: { Nombre: "rep", Teléfono: "phone", Imagen: "image" },
        },
      }),
    });
    expect(models.Guest.create).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        imported: 1,
        imageWarnings: [
          expect.objectContaining({
            rep: "Luis Pérez",
            reason: "No se pudo descargar la imagen del enlace.",
          }),
        ],
      }),
    );
  });

  test("confirmImport actualiza la imagen si el teléfono ya existe", async () => {
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Nombre", "Teléfono", "Imagen"],
      ["Luis Pérez", "5511111111", ""],
    ]);
    XLSX.utils.book_append_sheet(wb, sheet, "Invitados");
    const zip = await JSZip.loadAsync(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    const xml = await zip.file("xl/worksheets/sheet1.xml").async("string");
    zip.file(
      "xl/worksheets/sheet1.xml",
      xml.replace(/<row r="2"[^>]*>/, (row) => `${row}<c r="C2"><f>DISPIMG(&quot;ID_QR1&quot;,1)</f></c>`),
    );
    zip.file("xl/media/image1.png", TINY_PNG);
    zip.file("xl/cellimages.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <etc:cellImages><etc:cellImage><xdr:cNvPr name="ID_QR1"/><a:blip r:embed="rId1"/></etc:cellImage></etc:cellImages>`);
    zip.file("xl/_rels/cellimages.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
      </Relationships>`);
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const token = await stageSpreadsheet({
      userId: "usr_test_1",
      eventId: "evt_1",
      buffer,
      filename: "lista.xlsx",
    });
    const guest = fakeGuest({
      phone: "5511111111",
      invitationImagePath: "guest-images/evt_1/gst_1.jpg",
    });
    models.Guest.findAll.mockResolvedValue([guest]);
    const saved = path.join(env.uploadsDir, "guest-images", "evt_1", "gst_1.png");
    try {
      const { res } = await callHandler(controller.confirmImport, {
        req: createMockReq({
          user: fakeUser(),
          params: { eventId: "boda-ana" },
          body: {
            mapping: { Nombre: "rep", Teléfono: "phone", Imagen: "image" },
            importToken: token,
          },
        }),
      });
      expect(models.Guest.create).not.toHaveBeenCalled();
      expect(guest.invitationImagePath).toBe("guest-images/evt_1/gst_1.png");
      expect(guest.save).toHaveBeenCalled();
      await expect(fs.readFile(saved)).resolves.toEqual(TINY_PNG);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ imported: 0, skipped: 1, imagesUpdated: 1 }),
      );
    } finally {
      await fs.unlink(saved).catch(() => {});
    }
  });

  test("exportGuests csv llama send", async () => {
    models.Guest.findAll.mockResolvedValue([fakeGuest()]);
    const { res } = await callHandler(controller.exportGuests, {
      req: createMockReq({ params: { eventId: "boda-ana" }, query: { format: "csv" } }),
    });
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", expect.stringContaining("csv"));
    expect(res.send).toHaveBeenCalled();
  });

  test("deleteGuest 404", async () => {
    models.Guest.findOne.mockResolvedValue(null);
    const { res } = await callHandler(controller.deleteGuest, {
      req: createMockReq({ user: fakeUser(), params: { guestId: "missing" } }),
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("deleteGuest ok", async () => {
    const guest = fakeGuest();
    guest.destroy = jest.fn(async () => guest);
    models.Guest.findOne.mockResolvedValue(guest);
    models.Conversation.findOne.mockResolvedValue({ id: "conv_1" });
    const { res } = await callHandler(controller.deleteGuest, {
      req: createMockReq({ user: fakeUser(), params: { guestId: "gst_1" } }),
    });
    expect(models.Message.destroy).toHaveBeenCalled();
    expect(guest.destroy).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test("remindGuest deja whatsapp pendiente para el callback de Meta", async () => {
    const guest = fakeGuest({ status: "enviado", whatsapp: "entregado" });
    models.Guest.findOne.mockResolvedValue(guest);

    const { res } = await callHandler(controller.remindGuest, {
      req: createMockReq({ user: fakeUser(), params: { guestId: "gst_1" } }),
    });

    expect(resolvePurposeSendContext).toHaveBeenCalledWith(
      expect.objectContaining({ id: "evt_1" }),
      "reminder",
    );
    expect(deliverAiMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "reminder",
        sync: true,
        hsmTemplateName: "alanna_rm_aa_1",
        hsmParams: ["Luis", "2", "mayo"],
        guestPatch: expect.objectContaining({
          status: "enviado",
          whatsapp: "pendiente",
        }),
      }),
    );
    expect(res.json).toHaveBeenCalled();
  });

  test("remindGuest envía invitación inicial si el invitado no ha sido contactado", async () => {
    const guest = fakeGuest({ status: "sin_contactar", whatsapp: "pendiente" });
    models.Guest.findOne.mockResolvedValue(guest);
    resolveCampaignSendContext.mockResolvedValue({
      template: {
        name: "alanna_pc_aa_1",
        components: [{ type: "BODY", text: "Hola {{1}}, tienes {{2}} pases." }],
      },
      link: {},
      hsmTemplateName: "alanna_pc_aa_1",
      hsmParamsFor: jest.fn(async () => ["Luis", "2"]),
      hsmHeaderDocument: null,
      hsmHeaderImage: {
        relativePath: "template-headers/usr_1/tpl_1/header.jpg",
        fileName: "header.jpg",
        mime: "image/jpeg",
      },
    });

    const { res } = await callHandler(controller.remindGuest, {
      req: createMockReq({ user: fakeUser(), params: { guestId: "gst_1" } }),
    });

    expect(resolveReminderText).not.toHaveBeenCalled();
    expect(resolvePurposeSendContext).not.toHaveBeenCalled();
    expect(resolveCampaignSendContext).toHaveBeenCalledWith(expect.objectContaining({ id: "evt_1" }));
    expect(deliverAiMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "campaign",
        sync: true,
        text: "Hola Luis, tienes 2 pases.",
        hsmParams: ["Luis", "2"],
        hsmTemplateName: "alanna_pc_aa_1",
        hsmHeaderImage: {
          relativePath: "template-headers/usr_1/tpl_1/header.jpg",
          fileName: "header.jpg",
          mime: "image/jpeg",
        },
        guestPatch: expect.objectContaining({
          status: "enviado",
          whatsapp: "pendiente",
        }),
      }),
    );
    expect(res.json).toHaveBeenCalled();
  });
});

describe("guests.controller Asistente", () => {
  let controller;
  let models;

  beforeEach(async () => {
    ({ mod: controller, models } = await loadWithMocks("src/controllers/guests.controller.js", {
      extraMocks: {
        "src/services/access.service.js": () => ({
          requireEvent: jest.fn(async () => fakeEvent()),
          userEventIds: jest.fn(async () => ["evt_1"]),
          requirePermission: jest.fn(async (_req, res) => {
            res.status(403).json({ error: "No tienes permiso para esta acción." });
            return false;
          }),
          hasEventPermission: jest.fn(async () => false),
          PERMS,
        }),
        "src/services/activity.service.js": () => ({ logActivity: jest.fn(async () => undefined) }),
        "src/services/outbound.worker.js": () => ({ enqueueJob: jest.fn(async () => undefined) }),
        "src/services/plans.service.js": () => ({
          assertCanAddGuestsForEvent: jest.fn(async () => undefined),
          assertCanSendInvitations: jest.fn(() => undefined),
        }),
        "src/services/export.service.js": () => ({
          guestsToRows: jest.fn((guests) => guests || []),
          toCsv: jest.fn(async () => Buffer.from("csv,data")),
          toPdf: jest.fn(async () => Buffer.from("%PDF-mock")),
          toXlsx: jest.fn(async () => Buffer.from("xlsx-mock")),
        }),
      },
    }));
    models.Event.findByPk.mockResolvedValue(fakeEvent());
    models.Guest.findOne.mockResolvedValue(fakeGuest());
  });

  test("updateGuest 403 sin permisos de edición", async () => {
    const { res } = await callHandler(controller.updateGuest, {
      req: createMockReq({ user: fakeUser(), params: { guestId: "gst_1" }, body: { phone: "5511111111" } }),
    });
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test("exportGuests GET 403 sin permiso de exportar", async () => {
    const { res } = await callHandler(controller.exportGuests, {
      req: createMockReq({ params: { eventId: "boda-ana" }, query: { format: "csv" } }),
    });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).not.toHaveBeenCalled();
  });
});