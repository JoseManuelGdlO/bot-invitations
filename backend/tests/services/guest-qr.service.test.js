import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectGuestImage } from "../../src/services/guest-image.service.js";
import {
  GuestQrError,
  headerImageForSend,
  normalizeImageAttachment,
  resolveGuestQrPayload,
  rewriteDeskoplusPaseUrl,
} from "../../src/services/guest-qr.service.js";

const PASE = "https://deskoplus.com/acceso/?rol=pase&t=HzEfffuDNjFWBQjdMc";
const RECEPCION = "https://deskoplus.com/acceso/?rol=recepcion&qr=HzEfffuDNjFWBQjdMc";

describe("guest-qr.service", () => {
  test("un pase de Deskoplus se convierte en la url de recepción", () => {
    expect(rewriteDeskoplusPaseUrl(PASE)).toBe(RECEPCION);
  });

  test("una url de recepción se conserva", () => {
    expect(rewriteDeskoplusPaseUrl(RECEPCION)).toBe(RECEPCION);
  });

  test("resuelve la variable del invitado y reescribe el pase", () => {
    expect(resolveGuestQrPayload("{{enlace}}", { enlace: PASE })).toBe(RECEPCION);
  });

  test("exige el dato del invitado", () => {
    expect(() => resolveGuestQrPayload("{{enlace}}", {})).toThrow(GuestQrError);
  });

  test("solo guarda el contenido cuando el encabezado es imagen y el modo es qr", () => {
    expect(normalizeImageAttachment({
      headerType: "image",
      imageAttachment: "qr",
      qrContent: " {{enlace}} ",
    })).toEqual({ imageAttachment: "qr", qrContent: "{{enlace}}" });
    expect(normalizeImageAttachment({
      headerType: "document",
      imageAttachment: "qr",
      qrContent: "{{enlace}}",
    })).toEqual({ imageAttachment: "file", qrContent: null });
    expect(() => normalizeImageAttachment({
      headerType: "image",
      imageAttachment: "qr",
      qrContent: "  ",
    })).toThrow(/dentro del QR/);
  });

  test("al enviar genera un png y no usa la foto del invitado", async () => {
    const uploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), "guest-qr-"));
    const header = await headerImageForSend(
      {
        imageAttachment: "qr",
        qrContent: "{{enlace}}",
        event: { id: "evt_1", name: "Boda" },
        hsmHeaderImage: { relativePath: "opening-docs/evt_1/portada.jpg", fileName: "portada.jpg" },
        template: { headerType: "image" },
      },
      {
        id: "gst_1",
        eventId: "evt_1",
        rep: "Sylvia",
        invitationImagePath: "guest-images/evt_1/gst_1.png",
        customData: { enlace: PASE },
      },
      { uploadsDir },
    );
    expect(header.source).toBe("qr");
    expect(header.relativePath).toBe("guest-images/evt_1/gst_1-qr.png");
    expect(header.mime).toBe("image/png");
    const bytes = await fs.readFile(path.join(uploadsDir, header.relativePath));
    expect(detectGuestImage(bytes)?.mime).toBe("image/png");
  });
});
