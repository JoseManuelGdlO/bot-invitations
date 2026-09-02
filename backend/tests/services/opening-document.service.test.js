import { jest } from "@jest/globals";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadWithMocks, fakeEvent } from "../helpers/loadWithMocks.js";
import { createInstance } from "../helpers/models.js";

describe("opening-document.service", () => {
  let service;
  let models;
  let tmpDir;
  let envState;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "alanna-opening-"));
    envState = {
      uploadsDir: tmpDir,
      bundledOpeningDocsDir: "",
      meta: { templateNameDocument: "rg_eventos" },
    };
    ({ mod: service, models } = await loadWithMocks("src/services/opening-document.service.js", {
      extraMocks: {
        "src/config/env.js": () => ({ env: envState }),
      },
    }));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("extractOpeningDocsRelative acepta ruta relativa y absoluta de Docker", () => {
    expect(service.extractOpeningDocsRelative("opening-docs/evt/a.pdf")).toBe("opening-docs/evt/a.pdf");
    expect(service.extractOpeningDocsRelative("/app/uploads/opening-docs/evt/a.pdf")).toBe(
      "opening-docs/evt/a.pdf",
    );
    expect(service.extractOpeningDocsRelative("/tmp/inv.pdf")).toBeNull();
  });

  test("absoluteDocumentPath reescribe /app/uploads al UPLOADS_DIR actual", () => {
    const abs = service.absoluteDocumentPath("/app/uploads/opening-docs/evt/a.pdf");
    expect(abs).toBe(path.join(tmpDir, "opening-docs/evt/a.pdf"));
  });

  test("resolveOpeningDocumentFilePath usa relativePath o remapea filePath de Docker", () => {
    expect(
      service.resolveOpeningDocumentFilePath({ relativePath: "opening-docs/evt/a.pdf" }),
    ).toBe(path.join(tmpDir, "opening-docs/evt/a.pdf"));
    expect(
      service.resolveOpeningDocumentFilePath({
        filePath: "/app/uploads/opening-docs/evt/a.pdf",
      }),
    ).toBe(path.join(tmpDir, "opening-docs/evt/a.pdf"));
    expect(service.resolveOpeningDocumentFilePath({ filePath: "/tmp/inv.pdf" })).toBe("/tmp/inv.pdf");
  });

  test("detectOpeningDocumentType acepta pdf y word", () => {
    expect(service.detectOpeningDocumentType({ originalname: "a.pdf", mimetype: "application/pdf" })).toEqual(
      expect.objectContaining({ mime: "application/pdf", ext: ".pdf" }),
    );
    expect(
      service.detectOpeningDocumentType({
        originalname: "a.docx",
        mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).toEqual(expect.objectContaining({ ext: ".docx" }));
    expect(service.detectOpeningDocumentType({ originalname: "a.doc", mimetype: "application/msword" })).toEqual(
      expect.objectContaining({ ext: ".doc" }),
    );
    expect(service.detectOpeningDocumentType({ originalname: "a.png", mimetype: "image/png" })).toBeNull();
  });

  test("assertOpeningDocumentReady 400 si el switch está on y no hay archivo", async () => {
    await expect(service.assertOpeningDocumentReady({ attachDocument: true })).rejects.toMatchObject({
      status: 400,
      message: "Activa el adjunto pero falta el documento.",
    });
  });

  test("assertOpeningDocumentReady pasa si el switch está off", async () => {
    await expect(service.assertOpeningDocumentReady({ attachDocument: false })).resolves.toEqual({
      attachDocument: false,
    });
  });

  test("assertOpeningDocumentReady usa el PDF del evento si el UUID de la BD no existe", async () => {
    const eventId = "c0509ed4-f3a2-4667-8eca-d6459bbea6a9";
    const dir = path.join(tmpDir, "opening-docs", eventId);
    await fs.mkdir(dir, { recursive: true });
    const realName = "5b39ec5f-897e-405e-9ccf-c01f06954a14.pdf";
    await fs.writeFile(path.join(dir, realName), Buffer.from("%PDF-git"));
    const tpl = createInstance({
      attachDocument: true,
      eventId,
      documentPath: `opening-docs/${eventId}/65a2c9de-5143-41af-8bf2-30bc1ec2763e.pdf`,
      documentFileName: "Invitacion_Brenda_Denis.pdf",
      documentMime: "application/pdf",
    });
    await expect(service.assertOpeningDocumentReady(tpl)).resolves.toMatchObject({
      attachDocument: true,
      templateName: "rg_eventos",
      eventId,
      relativePath: `opening-docs/${eventId}/${realName}`,
      fileName: "Invitacion_Brenda_Denis.pdf",
    });
    expect(tpl.documentPath).toBe(`opening-docs/${eventId}/${realName}`);
    expect(tpl.save).toHaveBeenCalled();
  });

  test("assertOpeningDocumentReady usa el PDF versionado en bundled-opening-docs", async () => {
    const eventId = "evt_bundled";
    const bundled = path.join(tmpDir, "bundled");
    await fs.mkdir(path.join(bundled, eventId), { recursive: true });
    await fs.writeFile(path.join(bundled, eventId, "from-git.pdf"), Buffer.from("%PDF-bundled"));
    envState.bundledOpeningDocsDir = bundled;
    await expect(
      service.assertOpeningDocumentReady({
        attachDocument: true,
        eventId,
        documentPath: `opening-docs/${eventId}/missing.pdf`,
        documentFileName: "inv.pdf",
      }),
    ).resolves.toMatchObject({
      templateName: "rg_eventos",
      relativePath: `opening-docs/${eventId}/from-git.pdf`,
    });
  });

  test("saveOpeningDocument 400 si el MIME no es pdf ni word", async () => {
    await expect(
      service.saveOpeningDocument(fakeEvent(), {
        originalname: "foto.png",
        mimetype: "image/png",
        buffer: Buffer.from("x"),
      }),
    ).rejects.toMatchObject({ status: 400, message: "El documento debe ser PDF o Word (doc, docx)." });
  });

  test("saveOpeningDocument 400 si supera 10 MB", async () => {
    await expect(
      service.saveOpeningDocument(fakeEvent(), {
        originalname: "inv.pdf",
        mimetype: "application/pdf",
        buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
      }),
    ).rejects.toMatchObject({ status: 400, message: "El archivo no puede superar 10 MB." });
  });

  test("saveOpeningDocument escribe el archivo y reemplaza el anterior", async () => {
    const tpl = createInstance({
      id: "t1",
      category: "Primer contacto",
      body: "copy",
      greetingVar: "nombre",
      attachDocument: false,
      documentPath: null,
    });
    models.Template.findOne.mockResolvedValue(tpl);
    const first = await service.saveOpeningDocument(fakeEvent(), {
      originalname: "inv.pdf",
      mimetype: "application/pdf",
      buffer: Buffer.from("%PDF-1"),
    });
    expect(first.document.fileName).toBe("inv.pdf");
    expect(tpl.attachDocument).toBe(true);
    const firstAbs = path.join(tmpDir, tpl.documentPath);
    await expect(fs.access(firstAbs)).resolves.toBeUndefined();

    const second = await service.saveOpeningDocument(fakeEvent(), {
      originalname: "otra.pdf",
      mimetype: "application/pdf",
      buffer: Buffer.from("%PDF-2"),
    });
    expect(second.document.fileName).toBe("otra.pdf");
    await expect(fs.access(firstAbs)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
