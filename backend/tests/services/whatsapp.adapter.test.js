import { jest } from "@jest/globals";
import { loadWithMocks, fakeEvent, fakeGuest } from "../helpers/loadWithMocks.js";

describe("whatsapp.adapter MetaCloudProvider", () => {
  let adapter;
  let models;
  let sendTemplateWithRetry;
  let sendTextWithRetry;

  function sanitizeMetaBodyParam(value) {
    return String(value || "")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/ {2,}/g, " ")
      .trim()
      .slice(0, 1024);
  }

  beforeEach(async () => {
    sendTemplateWithRetry = jest.fn(async () => ({ messages: [{ id: "wamid.tpl" }] }));
    sendTextWithRetry = jest.fn(async () => ({ messages: [{ id: "wamid.txt" }] }));
    ({ mod: adapter, models } = await loadWithMocks("src/services/whatsapp.adapter.js", {
      extraMocks: {
        "src/services/meta.client.js": () => ({
          metaClient: { sendTemplateWithRetry, sendTextWithRetry },
          sanitizeMetaBodyParam,
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

  test("cold (sin inbound) envía plantilla con {{1}} nombre y {{2}} copy a 10 dígitos", async () => {
    models.Event.findByPk.mockResolvedValue(fakeEvent());
    models.Guest.findByPk.mockResolvedValue(fakeGuest({ rep: "Luis Pérez", status: "sin_contactar" }));
    models.Conversation.findOne.mockResolvedValue(null);
    const provider = adapter.createWhatsAppProvider();
    const result = await provider.sendMessage("5215512345678", "Hola\ninvitación", {
      eventId: "evt_1",
      guestId: "gst_1",
    });
    expect(sendTemplateWithRetry).toHaveBeenCalledWith({
      to: "5512345678",
      bodyParams: ["Luis", "Hola invitación"],
    });
    expect(sendTextWithRetry).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        provider: "meta-cloud",
        providerId: "wamid.tpl",
        to: "5512345678",
        skipped: false,
      }),
    );
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
    expect(sendTextWithRetry).toHaveBeenCalledWith({ to: "6183218624", text: "¿Confirmas?" });
    expect(sendTemplateWithRetry).not.toHaveBeenCalled();
    expect(result.providerId).toBe("wamid.txt");
  });
});
