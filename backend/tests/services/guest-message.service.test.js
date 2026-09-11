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

  test("encola el header IMAGE y registra el mensaje como template", async () => {
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
      expect.objectContaining({ hsmHeaderImage }),
    );
    expect(models.Message.create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "template" }),
    );
  });

  test("sigue encolando el header DOCUMENT", async () => {
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
      expect.objectContaining({ hsmHeaderDocument }),
    );
  });
});
