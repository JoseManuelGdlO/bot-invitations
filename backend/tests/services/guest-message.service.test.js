import { jest } from "@jest/globals";
import { loadWithMocks, fakeEvent, fakeGuest } from "../helpers/loadWithMocks.js";
import { createInstance } from "../helpers/models.js";

describe("guest-message.service", () => {
  let service;
  let models;
  let enqueueJob;

  beforeEach(async () => {
    enqueueJob = jest.fn(async () => undefined);
    ({ mod: service, models } = await loadWithMocks("src/services/guest-message.service.js", {
      extraMocks: {
        "src/services/outbound.worker.js": () => ({ enqueueJob }),
        "src/services/bot/bot.service.js": () => ({
          appendOutboundToSession: jest.fn(async () => undefined),
        }),
      },
    }));
    models.Conversation.findOne.mockResolvedValue(
      createInstance({ id: "conv_1", eventId: "evt_1", guestId: "gst_1" }),
    );
  });

  test("encola el header IMAGE sin persistir el mensaje aún", async () => {
    const hsmHeaderImage = {
      relativePath: "template-images/evt_1/header.jpg",
      mime: "image/jpeg",
      eventId: "evt_1",
    };

    await service.deliverAiMessage({
      event: fakeEvent(),
      guest: fakeGuest(),
      text: "Hola Luis",
      hsmHeaderImage,
    });

    expect(enqueueJob).toHaveBeenCalledWith(
      "whatsapp.send",
      expect.objectContaining({
        hsmHeaderImage,
        persistMessage: true,
        appendToSession: true,
        messageKind: "template",
        messageFrom: "ai",
      }),
    );
    expect(models.Message.create).not.toHaveBeenCalled();
  });

  test("async no aplica guestPatch ni lastMessage hasta el worker", async () => {
    const guest = fakeGuest({ lastMessage: "antes" });
    await service.deliverAiMessage({
      event: fakeEvent(),
      guest,
      text: "Hola Luis",
      guestPatch: { status: "enviado", whatsapp: "pendiente" },
    });

    expect(guest.lastMessage).toBe("antes");
    expect(guest.status).toBe("sin_contactar");
    expect(guest.save).not.toHaveBeenCalled();
    expect(enqueueJob).toHaveBeenCalledWith(
      "whatsapp.send",
      expect.objectContaining({
        guestPatch: { status: "enviado", whatsapp: "pendiente" },
        appendToSession: true,
        persistMessage: true,
      }),
    );
  });

  test("sigue encolando el header DOCUMENT sin persistir el mensaje aún", async () => {
    const hsmHeaderDocument = {
      relativePath: "opening-docs/evt_1/invitacion.pdf",
      fileName: "invitacion.pdf",
      mime: "application/pdf",
      eventId: "evt_1",
    };

    await service.deliverAiMessage({
      event: fakeEvent(),
      guest: fakeGuest(),
      text: "Hola Luis",
      hsmHeaderDocument,
    });

    expect(enqueueJob).toHaveBeenCalledWith(
      "whatsapp.send",
      expect.objectContaining({ hsmHeaderDocument, persistMessage: true, appendToSession: true }),
    );
    expect(models.Message.create).not.toHaveBeenCalled();
  });

  test("sync envía y solo entonces crea el mensaje", async () => {
    const sendMessage = jest.fn(async () => ({
      provider: "stub",
      skipped: false,
      providerId: "wamid.ok",
    }));
    ({ mod: service, models } = await loadWithMocks("src/services/guest-message.service.js", {
      extraMocks: {
        "src/services/outbound.worker.js": () => ({ enqueueJob }),
        "src/services/bot/bot.service.js": () => ({
          appendOutboundToSession: jest.fn(async () => undefined),
        }),
        "src/services/whatsapp.adapter.js": () => ({
          createWhatsAppProvider: () => ({ sendMessage }),
        }),
      },
    }));
    models.Conversation.findOne.mockResolvedValue(
      createInstance({ id: "conv_1", eventId: "evt_1", guestId: "gst_1" }),
    );
    models.Message.create.mockResolvedValue(createInstance({ id: "msg_1" }));

    await service.deliverAiMessage({
      event: fakeEvent(),
      guest: fakeGuest(),
      text: "Hola Luis",
      sync: true,
    });

    expect(sendMessage).toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(models.Message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv_1",
        text: "Hola Luis",
        providerId: "wamid.ok",
      }),
    );
  });

  test("sync no crea mensaje si el provider falla", async () => {
    const sendMessage = jest.fn(async () => {
      throw new Error("Meta boom");
    });
    ({ mod: service, models } = await loadWithMocks("src/services/guest-message.service.js", {
      extraMocks: {
        "src/services/outbound.worker.js": () => ({ enqueueJob }),
        "src/services/bot/bot.service.js": () => ({
          appendOutboundToSession: jest.fn(async () => undefined),
        }),
        "src/services/whatsapp.adapter.js": () => ({
          createWhatsAppProvider: () => ({ sendMessage }),
        }),
      },
    }));
    models.Conversation.findOne.mockResolvedValue(
      createInstance({ id: "conv_1", eventId: "evt_1", guestId: "gst_1" }),
    );

    await expect(
      service.deliverAiMessage({
        event: fakeEvent(),
        guest: fakeGuest(),
        text: "Hola Luis",
        sync: true,
      }),
    ).rejects.toThrow("Meta boom");

    expect(models.Message.create).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});
