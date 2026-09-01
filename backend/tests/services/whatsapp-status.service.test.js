import { jest } from "@jest/globals";
import { loadWithMocks, fakeGuest } from "../helpers/loadWithMocks.js";
import { createInstance } from "../helpers/models.js";

describe("whatsapp-status.service", () => {
  let applyWhatsappDeliveryStatus;
  let models;

  function guestRow(overrides = {}) {
    return createInstance({
      id: "gst_1",
      status: "enviado",
      whatsapp: "pendiente",
      lastReply: null,
      contactedAt: new Date("2026-01-01T00:00:00.000Z"),
      ...overrides,
    });
  }

  async function setup(guest = guestRow()) {
    ({ mod: { applyWhatsappDeliveryStatus }, models } = await loadWithMocks(
      "src/services/whatsapp-status.service.js",
    ));
    models.Message.findOne.mockResolvedValue(
      createInstance({ id: "msg_1", conversationId: "cnv_1", providerId: "wamid.abc", from: "ai" }),
    );
    models.Conversation.findByPk.mockResolvedValue(
      createInstance({ id: "cnv_1", guestId: guest.id }),
    );
    models.Guest.findByPk.mockResolvedValue(guest);
    return guest;
  }

  test("sent marca whatsapp enviado", async () => {
    const guest = await setup();
    const result = await applyWhatsappDeliveryStatus({ messageId: "wamid.abc", status: "sent" });
    expect(result.reason).toBe("status_sent");
    expect(guest.whatsapp).toBe("enviado");
    expect(guest.status).toBe("enviado");
    expect(guest.save).toHaveBeenCalled();
  });

  test("delivered marca entregado en whatsapp y RSVP", async () => {
    const guest = await setup(guestRow({ whatsapp: "enviado" }));
    await applyWhatsappDeliveryStatus({ messageId: "wamid.abc", status: "delivered" });
    expect(guest.whatsapp).toBe("entregado");
    expect(guest.status).toBe("entregado");
  });

  test("read marca leido y no pisa un RSVP posterior", async () => {
    const guest = await setup(guestRow({ status: "en_conversacion", whatsapp: "entregado" }));
    await applyWhatsappDeliveryStatus({ messageId: "wamid.abc", status: "read" });
    expect(guest.whatsapp).toBe("leido");
    expect(guest.status).toBe("en_conversacion");
  });

  test("no baja de leido a enviado", async () => {
    const guest = await setup(guestRow({ whatsapp: "leido", status: "entregado" }));
    await applyWhatsappDeliveryStatus({ messageId: "wamid.abc", status: "sent" });
    expect(guest.whatsapp).toBe("leido");
    expect(guest.save).not.toHaveBeenCalled();
  });

  test("no pisa respondido", async () => {
    const guest = await setup(guestRow({ whatsapp: "respondido", status: "en_conversacion" }));
    await applyWhatsappDeliveryStatus({ messageId: "wamid.abc", status: "read" });
    expect(guest.whatsapp).toBe("respondido");
    expect(guest.status).toBe("en_conversacion");
    expect(guest.save).not.toHaveBeenCalled();
  });

  test("failed revierte campaña sin reply", async () => {
    const guest = await setup();
    const result = await applyWhatsappDeliveryStatus({ messageId: "wamid.abc", status: "failed" });
    expect(result.reason).toBe("failed_reverted");
    expect(guest.status).toBe("sin_contactar");
    expect(guest.whatsapp).toBe("pendiente");
    expect(guest.contactedAt).toBeNull();
  });

  test("failed loguea código y details de Meta", async () => {
    await setup(guestRow({ phone: "6181018285", rep: "Ana" }));
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await applyWhatsappDeliveryStatus({
      messageId: "wamid.abc",
      status: "failed",
      recipientId: "6181018285",
      errors: [
        {
          code: 131026,
          title: "Message undeliverable",
          message: "Message undeliverable",
          details: "Message Undeliverable.",
        },
      ],
    });
    const dumped = spy.mock.calls.map((args) => args.join(" ")).join("\n");
    spy.mockRestore();
    expect(dumped).toContain("status failed");
    expect(dumped).toContain("131026");
    expect(dumped).toContain("Message Undeliverable");
    expect(dumped).toContain("6181018285");
  });

  test("failed no revierte si ya hubo reply", async () => {
    const guest = await setup(guestRow({ lastReply: "ok", whatsapp: "enviado" }));
    const result = await applyWhatsappDeliveryStatus({ messageId: "wamid.abc", status: "failed" });
    expect(result.reason).toBe("failed");
    expect(guest.status).toBe("enviado");
  });

  test("wamid desconocido no toca invitados", async () => {
    const guest = fakeGuest();
    ({ mod: { applyWhatsappDeliveryStatus }, models } = await loadWithMocks(
      "src/services/whatsapp-status.service.js",
    ));
    models.Message.findOne.mockResolvedValue(null);
    const result = await applyWhatsappDeliveryStatus({ messageId: "wamid.missing", status: "sent" });
    expect(result.reason).toBe("unknown_message");
    expect(models.Guest.findByPk).not.toHaveBeenCalled();
    expect(guest.save).not.toHaveBeenCalled();
  });
});
