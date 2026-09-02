import { jest } from "@jest/globals";
import { loadWithMocks, fakeEvent, fakeGuest } from "../helpers/loadWithMocks.js";

describe("whatsapp.adapter MetaCloudProvider", () => {
  let adapter;
  let models;
  let sendTemplateWithRetry;
  let sendTextWithRetry;
  let uploadDocument;
  let resolveActiveWhatsappMetaByOwner;
  const metaAuth = { accessToken: "owner-token", phoneNumberId: "10987654321" };

  function sanitizeMetaBodyParam(value) {
    return String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\t/g, " ")
      .replace(/ {2,}/g, " ")
      .trim()
      .slice(0, 1024);
  }

  beforeEach(async () => {
    sendTemplateWithRetry = jest.fn(async () => ({ messages: [{ id: "wamid.tpl" }] }));
    sendTextWithRetry = jest.fn(async () => ({ messages: [{ id: "wamid.txt" }] }));
    uploadDocument = jest.fn(async () => "media_from_path");
    resolveActiveWhatsappMetaByOwner = jest.fn(async () => ({
      credentials: metaAuth,
    }));
    ({ mod: adapter, models } = await loadWithMocks("src/services/whatsapp.adapter.js", {
      extraMocks: {
        "src/services/meta.client.js": () => ({
          metaClient: { sendTemplateWithRetry, sendTextWithRetry, uploadDocument },
          sanitizeMetaBodyParam,
        }),
        "src/services/whatsapp-meta.service.js": () => ({
          resolveActiveWhatsappMetaByOwner,
        }),
      },
    }));
  });

  test("el provider actual es Meta Cloud", () => {
    const provider = adapter.createWhatsAppProvider();
    expect(provider).toBeInstanceOf(adapter.MetaCloudProvider);
  });

  test("sendMessage 400 sin eventId", async () => {
    const provider = adapter.createWhatsAppProvider();
    await expect(provider.sendMessage("5511111111", "Hola")).rejects.toMatchObject({
      status: 400,
    });
    expect(sendTemplateWithRetry).not.toHaveBeenCalled();
    expect(sendTextWithRetry).not.toHaveBeenCalled();
  });

  test("sendMessage 400 si el evento no existe", async () => {
    models.Event.findByPk.mockResolvedValue(null);
    const provider = adapter.createWhatsAppProvider();
    await expect(provider.sendMessage("5511111111", "Hola", { eventId: "evt_missing" })).rejects.toMatchObject({
      status: 400,
    });
  });

  test("cold (sin inbound) envía plantilla con {{1}} nombre y {{2}} copy a 521 + 10 dígitos", async () => {
    models.Event.findByPk.mockResolvedValue(fakeEvent());
    models.Guest.findByPk.mockResolvedValue(fakeGuest({ rep: "Luis Pérez", status: "sin_contactar" }));
    models.Conversation.findOne.mockResolvedValue(null);
    const provider = adapter.createWhatsAppProvider();
    const result = await provider.sendMessage("5215512345678", "Hola\ninvitación", {
      eventId: "evt_1",
      guestId: "gst_1",
    });
    expect(resolveActiveWhatsappMetaByOwner).toHaveBeenCalledWith("usr_test_1");
    expect(sendTemplateWithRetry).toHaveBeenCalledWith({
      to: "5215512345678",
      bodyParams: ["Luis", "Hola\ninvitación"],
      ...metaAuth,
    });
    expect(sendTextWithRetry).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        provider: "meta-cloud",
        providerId: "wamid.tpl",
        to: "5215512345678",
        skipped: false,
        conversationStarted: true,
      }),
    );
  });

  test("cold con hsmParams usa {{1}} y {{2}} del job", async () => {
    models.Event.findByPk.mockResolvedValue(fakeEvent());
    models.Guest.findByPk.mockResolvedValue(fakeGuest({ rep: "Luis Pérez", status: "sin_contactar" }));
    models.Conversation.findOne.mockResolvedValue(null);
    const provider = adapter.createWhatsAppProvider();
    await provider.sendMessage("5512345678", "mensaje compuesto", {
      eventId: "evt_1",
      guestId: "gst_1",
      hsmParams: ["Boda Ana", "Ana y Carlos. Los esperamos."],
    });
    expect(sendTemplateWithRetry).toHaveBeenCalledWith({
      to: "5215512345678",
      bodyParams: ["Boda Ana", "Ana y Carlos. Los esperamos."],
      ...metaAuth,
    });
  });

  test("cold con hsmParams de documento usa constructor2 y header", async () => {
    models.Event.findByPk.mockResolvedValue(fakeEvent());
    models.Guest.findByPk.mockResolvedValue(fakeGuest({ rep: "Luis Pérez", status: "sin_contactar" }));
    models.Conversation.findOne.mockResolvedValue(null);
    const provider = adapter.createWhatsAppProvider();
    await provider.sendMessage("5512345678", "mensaje compuesto", {
      eventId: "evt_1",
      guestId: "gst_1",
      hsmParams: ["Boda Ana", "Ana y Carlos. Los esperamos."],
      hsmTemplateName: "constructor2",
      hsmHeaderDocument: { id: "media_abc", filename: "invitacion.pdf" },
    });
    expect(sendTemplateWithRetry).toHaveBeenCalledWith({
      to: "5215512345678",
      bodyParams: ["Boda Ana", "Ana y Carlos. Los esperamos."],
      templateName: "constructor2",
      headerDocument: { id: "media_abc", filename: "invitacion.pdf" },
      ...metaAuth,
    });
  });

  test("sube el PDF al enviar si el job trae filePath", async () => {
    models.Event.findByPk.mockResolvedValue(fakeEvent());
    models.Guest.findByPk.mockResolvedValue(fakeGuest({ rep: "Luis Pérez", status: "enviado" }));
    models.Conversation.findOne.mockResolvedValue(null);
    const provider = adapter.createWhatsAppProvider();
    await provider.sendMessage("5512345678", "mensaje compuesto", {
      eventId: "evt_1",
      guestId: "gst_1",
      hsmParams: ["Boda Ana", "Ana y Carlos. Los esperamos."],
      hsmTemplateName: "constructor2",
      hsmHeaderDocument: {
        filePath: "/tmp/inv.pdf",
        filename: "invitacion.pdf",
        mime: "application/pdf",
      },
    });
    expect(uploadDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: "/tmp/inv.pdf",
        filename: "invitacion.pdf",
        mime: "application/pdf",
        ...metaAuth,
      }),
    );
    expect(sendTemplateWithRetry).toHaveBeenCalledWith({
      to: "5215512345678",
      bodyParams: ["Boda Ana", "Ana y Carlos. Los esperamos."],
      templateName: "constructor2",
      headerDocument: { id: "media_from_path", filename: "invitacion.pdf" },
      ...metaAuth,
    });
  });

  test("inbound más viejo de 24 h envía plantilla", async () => {
    models.Event.findByPk.mockResolvedValue(fakeEvent());
    models.Guest.findByPk.mockResolvedValue(fakeGuest({ status: "en_conversacion" }));
    models.Conversation.findOne.mockResolvedValue({ id: "conv_1", guestId: "gst_1" });
    models.Message.findOne.mockResolvedValue({
      from: "guest",
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });
    const provider = adapter.createWhatsAppProvider();
    await provider.sendMessage("6183218624", "Recordatorio", { eventId: "evt_1", guestId: "gst_1" });
    expect(sendTemplateWithRetry).toHaveBeenCalled();
    expect(sendTextWithRetry).not.toHaveBeenCalled();
  });

  test("sesión abierta (inbound reciente) envía texto libre", async () => {
    models.Event.findByPk.mockResolvedValue(fakeEvent());
    models.Guest.findByPk.mockResolvedValue(fakeGuest({ status: "en_conversacion" }));
    models.Conversation.findOne.mockResolvedValue({ id: "conv_1", guestId: "gst_1" });
    models.Message.findOne.mockResolvedValue({ from: "guest", createdAt: new Date() });
    const provider = adapter.createWhatsAppProvider();
    const result = await provider.sendMessage("6183218624", "¿Confirmas?", {
      eventId: "evt_1",
      guestId: "gst_1",
    });
    expect(sendTextWithRetry).toHaveBeenCalledWith({
      to: "5216183218624",
      text: "¿Confirmas?",
      ...metaAuth,
    });
    expect(sendTemplateWithRetry).not.toHaveBeenCalled();
    expect(result.providerId).toBe("wamid.txt");
    expect(result.conversationStarted).toBe(false);
  });
});
