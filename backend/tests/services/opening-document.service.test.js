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

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "alanna-opening-"));
    ({ mod: service, models } = await loadWithMocks("src/services/opening-document.service.js", {
      extraMocks: {
        "src/config/env.js": () => ({
          env: {
            uploadsDir: tmpDir,
            meta: { templateNameDocument: "constructor2" },
          },
        }),
      },
    }));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
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
      attachDocument: true,
      documentPath: null,
    });
    models.Template.findOne.mockResolvedValue(tpl);
    const first = await service.saveOpeningDocument(fakeEvent(), {
      originalname: "inv.pdf",
      mimetype: "application/pdf",
      buffer: Buffer.from("%PDF-1"),
    });
    expect(first.document.fileName).toBe("inv.pdf");
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
