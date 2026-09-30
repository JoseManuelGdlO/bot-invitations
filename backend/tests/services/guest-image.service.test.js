import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { jest } from "@jest/globals";
import JSZip from "jszip";
import XLSX from "xlsx";
import {
  GUEST_IMAGE_MAX_BYTES,
  detectGuestImage,
  downloadGuestImage,
  extractSheetImages,
  headerImageForGuest,
  isPrivateIp,
  resolveGuestImageBytes,
  saveGuestImage,
} from "../../src/services/guest-image.service.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PNG_B = Buffer.concat([PNG, Buffer.from([1])]);

function baseSheet() {
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Nombre", "Teléfono", "Imagen"],
    ["Luis Pérez", "5511111111", ""],
    ["Ana López", "5522222222", ""],
  ]);
  XLSX.utils.book_append_sheet(wb, sheet, "Invitados");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

async function withZip(mutate) {
  const zip = await JSZip.loadAsync(baseSheet());
  await mutate(zip);
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("guest-image.service", () => {
  test("detecta jpeg y png y rechaza otro contenido o más de 5 MB", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    expect(detectGuestImage(jpeg)).toEqual({ ext: ".jpg", mime: "image/jpeg" });
    expect(detectGuestImage(PNG)).toEqual({ ext: ".png", mime: "image/png" });
    expect(detectGuestImage(Buffer.from("GIF89a1234"))).toBeNull();
    const big = Buffer.alloc(GUEST_IMAGE_MAX_BYTES + 1, 0);
    big[0] = 0x89;
    big[1] = 0x50;
    big[2] = 0x4e;
    big[3] = 0x47;
    expect(detectGuestImage(big)).toBeNull();
  });

  test("isPrivateIp bloquea loopback, link-local y redes privadas", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true);
    expect(isPrivateIp("10.1.2.3")).toBe(true);
    expect(isPrivateIp("192.168.1.8")).toBe(true);
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("1.1.1.1")).toBe(false);
  });

  test("no descarga un enlace que resuelve a una red interna", async () => {
    const fetch = jest.fn();
    await expect(downloadGuestImage("https://qr.example/a.png", {
      lookup: async () => [{ address: "169.254.169.254", family: 4 }],
      fetch,
    })).rejects.toThrow(/no es público/);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("no sigue una redirección hacia una dirección interna", async () => {
    const fetch = jest.fn(async () => ({
      status: 302,
      headers: { get: (name) => (name === "location" ? "https://meta.internal/qr.png" : null) },
    }));
    await expect(downloadGuestImage("https://cdn.example/qr.png", {
      lookup: async (host) => (
        host === "cdn.example"
          ? [{ address: "1.1.1.1", family: 4 }]
          : [{ address: "127.0.0.1", family: 4 }]
      ),
      fetch,
    })).rejects.toThrow(/no es público/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("descarga un png público", async () => {
    const file = await downloadGuestImage("https://cdn.example/qr.png", {
      lookup: async () => [{ address: "1.1.1.1", family: 4 }],
      fetch: async () => ({
        status: 200,
        headers: { get: () => null },
        arrayBuffer: async () => PNG,
      }),
    });
    expect(file.mime).toBe("image/png");
    expect(file.buffer.equals(PNG)).toBe(true);
  });

  test("un enlace http o caído no impide reportar la fila", async () => {
    await expect(resolveGuestImageBytes({ cellText: "http://cdn.example/qr.png" })).resolves.toEqual({
      warning: "El enlace de la imagen debe usar https.",
    });
    await expect(resolveGuestImageBytes({
      cellText: "https://cdn.example/qr.png",
      download: async () => {
        throw new Error("falló");
      },
    })).resolves.toEqual({
      warning: "No se pudo descargar la imagen del enlace.",
    });
  });

  test("la imagen incrustada gana sobre el enlace", async () => {
    const download = jest.fn();
    const resolved = await resolveGuestImageBytes({
      embedded: { buffer: PNG },
      cellText: "https://cdn.example/qr.png",
      download,
    });
    expect(resolved.buffer.equals(PNG)).toBe(true);
    expect(download).not.toHaveBeenCalled();
  });

  test("extrae DISPIMG de la celda", async () => {
    const buffer = await withZip(async (zip) => {
      const sheet = await zip.file("xl/worksheets/sheet1.xml").async("string");
      zip.file(
        "xl/worksheets/sheet1.xml",
        sheet.replace(
          /<row r="2"[^>]*>/,
          (row) => `${row}<c r="C2"><f>DISPIMG(&quot;ID_QR1&quot;,1)</f></c>`,
        ),
      );
      zip.file("xl/media/image1.png", PNG);
      zip.file("xl/cellimages.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <etc:cellImages xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <etc:cellImage><xdr:cNvPr name="ID_QR1"/><a:blip r:embed="rId1"/></etc:cellImage>
        </etc:cellImages>`);
      zip.file("xl/_rels/cellimages.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
        </Relationships>`);
    });
    const images = await extractSheetImages(buffer);
    expect(images.get("2:3")?.buffer.equals(PNG)).toBe(true);
    expect(images.has("3:3")).toBe(false);
  });

  test("extrae imagen anclada a la celda y no pisa una imagen en celda", async () => {
    const buffer = await withZip(async (zip) => {
      const sheet = await zip.file("xl/worksheets/sheet1.xml").async("string");
      zip.file(
        "xl/worksheets/sheet1.xml",
        sheet.replace(
          /<row r="2"[^>]*>/,
          (row) => `${row}<c r="C2"><f>DISPIMG(&quot;ID_QR1&quot;,1)</f></c>`,
        ),
      );
      zip.file("xl/media/image1.png", PNG);
      zip.file("xl/media/image2.png", PNG_B);
      zip.file("xl/cellimages.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <etc:cellImages><etc:cellImage><xdr:cNvPr name="ID_QR1"/><a:blip r:embed="rId1"/></etc:cellImage></etc:cellImages>`);
      zip.file("xl/_rels/cellimages.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
        </Relationships>`);
      zip.file("xl/worksheets/_rels/sheet1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
        </Relationships>`);
      zip.file("xl/drawings/drawing1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <xdr:wsDr>
          <xdr:twoCellAnchor>
            <xdr:from><xdr:col>2</xdr:col><xdr:row>1</xdr:row></xdr:from>
            <a:blip r:embed="rId1"/>
          </xdr:twoCellAnchor>
          <xdr:twoCellAnchor>
            <xdr:from><xdr:col>2</xdr:col><xdr:row>2</xdr:row></xdr:from>
            <a:blip r:embed="rId2"/>
          </xdr:twoCellAnchor>
        </xdr:wsDr>`);
      zip.file("xl/drawings/_rels/drawing1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image2.png"/>
          <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image2.png"/>
        </Relationships>`);
    });
    const images = await extractSheetImages(buffer);
    expect(images.get("2:3")?.buffer.equals(PNG)).toBe(true);
    expect(images.get("3:3")?.buffer.equals(PNG_B)).toBe(true);
  });

  test("extrae imagen colocada en la celda por vm", async () => {
    const buffer = await withZip(async (zip) => {
      const sheet = await zip.file("xl/worksheets/sheet1.xml").async("string");
      zip.file(
        "xl/worksheets/sheet1.xml",
        sheet.replace(/<row r="3"[^>]*>/, (row) => `${row}<c r="C3" vm="1"/>`),
      );
      zip.file("xl/media/image1.png", PNG);
      zip.file("xl/richData/richValueRel.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <richValueRels xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <rel r:id="rId1"/>
        </richValueRels>`);
      zip.file("xl/richData/_rels/richValueRel.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
        </Relationships>`);
    });
    const images = await extractSheetImages(buffer);
    expect(images.get("3:3")?.buffer.equals(PNG)).toBe(true);
  });

  test("guarda el archivo bajo guest-images y el encabezado usa el del invitado", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "guest-img-"));
    const relative = await saveGuestImage({
      eventId: "evt_1",
      guestId: "gst_1",
      buffer: PNG,
      uploadsDir: root,
    });
    expect(relative).toBe("guest-images/evt_1/gst_1.png");
    const header = headerImageForGuest(
      {
        template: { headerType: "image" },
        hsmHeaderImage: { relativePath: "template-headers/a.jpg", fileName: "a.jpg", mime: "image/jpeg" },
      },
      { invitationImagePath: relative, eventId: "evt_1" },
      { uploadsDir: root },
    );
    expect(header.relativePath).toBe(relative);
    const fallback = headerImageForGuest(
      {
        template: { headerType: "image" },
        hsmHeaderImage: { relativePath: "template-headers/a.jpg", fileName: "a.jpg", mime: "image/jpeg" },
      },
      { invitationImagePath: "", eventId: "evt_1" },
      { uploadsDir: root },
    );
    expect(fallback.relativePath).toBe("template-headers/a.jpg");
    const storedOnly = headerImageForGuest(
      { template: { headerType: "none" }, hsmHeaderImage: null },
      { invitationImagePath: relative, eventId: "evt_1" },
      { uploadsDir: root },
    );
    expect(storedOnly).toBeNull();
  });
});
