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
    expect(guest.deliveryError).toBe("Error de la API de WhatsApp (Meta).");
  });

  test("failed loguea código y details de Meta", async () => {
    const guest = await setup(guestRow({ phone: "6181018285", rep: "Ana" }));
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
    expect(guest.deliveryError).toBe("El número de destino no es un WhatsApp válido.");
  });

  test("failed no revierte si ya hubo reply", async () => {
    const guest = await setup(guestRow({ lastReply: "ok", whatsapp: "enviado", deliveryError: null }));
    const result = await applyWhatsappDeliveryStatus({
      messageId: "wamid.abc",
      status: "failed",
      errors: [{ code: 131026, title: "Message undeliverable", message: "Message undeliverable" }],
    });
    expect(result.reason).toBe("failed");
    expect(guest.status).toBe("enviado");
    expect(guest.lastReply).toBe("ok");
    expect(guest.deliveryError).toBeNull();
  });

  test("131049 reagenda la plantilla a 24h y marca al invitado", async () => {
    const guest = await setup(guestRow({ phone: "14692309328", rep: "prueba" }));
    const source = createInstance({
      id: "job_1",
      type: "whatsapp.send",
      status: "done",
      payload: {
        to: "14692309328",
        text: "Hola prueba",
        guestId: guest.id,
        eventId: "evt_1",
        conversationId: "cnv_1",
        kind: "campaign",
        persistMessage: true,
        hsmTemplateName: "invitacion",
        hsmParams: ["prueba"],
        result: { providerId: "wamid.abc" },
      },
    });
    models.OutboundJob.findOne.mockImplementation(async (opts) => {
      if (opts?.where?.status === "queued") return null;
      return source;
    });
    const before = Date.now();
    const result = await applyWhatsappDeliveryStatus({
      messageId: "wamid.abc",
      status: "failed",
      errors: [{ code: 131049, title: "healthy ecosystem", message: "healthy ecosystem" }],
    });
    expect(result.reason).toBe("failed_rescheduled");
    expect(guest.status).toBe("reagendado");
    expect(guest.whatsapp).toBe("pendiente");
    expect(guest.contactedAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(models.OutboundJob.create).toHaveBeenCalledTimes(1);
    const created = models.OutboundJob.create.mock.calls[0][0];
    expect(created.type).toBe("whatsapp.send");
    expect(created.status).toBe("queued");
    expect(created.payload.hsmTemplateName).toBe("invitacion");
    expect(created.payload.hsmParams).toEqual(["prueba"]);
    expect(created.payload.ecosystemRetryOf).toBe("wamid.abc");
    expect(created.payload.ecosystemRetryCount).toBe(1);
    expect(created.payload.result).toBeUndefined();
    expect(created.payload.guestPatch).toMatchObject({ status: "enviado", whatsapp: "pendiente" });
    const delay = new Date(created.scheduledAt).getTime() - before;
    expect(delay).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
    expect(delay).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 5000);
    expect(guest.deliveryError).toBe(
      "Este mensaje no llegó para mantener un ecosistema sano. Se reintentará más tarde.",
    );
  });

  test("131049 no encola dos veces el mismo wamid", async () => {
    const guest = await setup();
    const source = createInstance({
      id: "job_1",
      status: "done",
      payload: {
        text: "Hola",
        guestId: guest.id,
        kind: "campaign",
        hsmTemplateName: "invitacion",
        result: { providerId: "wamid.abc" },
      },
    });
    let queued = null;
    models.OutboundJob.findOne.mockImplementation(async (opts) => {
      if (opts?.where?.status === "queued") return queued;
      return source;
    });
    models.OutboundJob.create.mockImplementation(async (data) => {
      queued = createInstance({ id: "job_retry", ...data });
      return queued;
    });
    const failed = {
      messageId: "wamid.abc",
      status: "failed",
      errors: [{ code: 131049, title: "healthy ecosystem", message: "healthy ecosystem" }],
    };
    await applyWhatsappDeliveryStatus(failed);
    await applyWhatsappDeliveryStatus(failed);
    expect(models.OutboundJob.create).toHaveBeenCalledTimes(1);
    expect(guest.status).toBe("reagendado");
  });

  test("131049 no reagenda si el invitado ya respondió", async () => {
    const guest = await setup(guestRow({ lastReply: "sí vamos", whatsapp: "enviado" }));
    const result = await applyWhatsappDeliveryStatus({
      messageId: "wamid.abc",
      status: "failed",
      errors: [{ code: 131049, title: "healthy ecosystem", message: "healthy ecosystem" }],
    });
    expect(result.reason).toBe("failed");
    expect(guest.status).toBe("enviado");
    expect(guest.lastReply).toBe("sí vamos");
    expect(guest.deliveryError).toBeUndefined();
    expect(models.OutboundJob.create).not.toHaveBeenCalled();
  });

  test("131049 agota reintentos y vuelve a sin contactar", async () => {
    const guest = await setup();
    models.OutboundJob.findOne.mockImplementation(async (opts) => {
      if (opts?.where?.status === "queued") return null;
      return createInstance({
        id: "job_3",
        status: "done",
        payload: {
          text: "Hola",
          guestId: guest.id,
          kind: "campaign",
          hsmTemplateName: "invitacion",
          ecosystemRetryCount: 3,
          result: { providerId: "wamid.abc" },
        },
      });
    });
    const result = await applyWhatsappDeliveryStatus({
      messageId: "wamid.abc",
      status: "failed",
      errors: [{ code: 131049, title: "healthy ecosystem", message: "healthy ecosystem" }],
    });
    expect(result.reason).toBe("failed_reverted");
    expect(guest.status).toBe("sin_contactar");
    expect(guest.deliveryError).toBe("Este mensaje no llegó para mantener un ecosistema sano.");
    expect(models.OutboundJob.create).not.toHaveBeenCalled();
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

  test("failed de wamid desconocido notifica el waiter de send-test", async () => {
    ({ mod: { applyWhatsappDeliveryStatus }, models } = await loadWithMocks(
      "src/services/whatsapp-status.service.js",
    ));
    models.Message.findOne.mockResolvedValue(null);
    const { waitForTestDelivery, resetTestDeliveryWaiters } = await import(
      "../../src/services/whatsapp-test-delivery.js"
    );
    resetTestDeliveryWaiters();
    const pending = waitForTestDelivery("wamid.test", 500);
    await applyWhatsappDeliveryStatus({
      messageId: "wamid.test",
      status: "failed",
      errors: [{ code: 131047, title: "Re-engagement message", message: "Re-engagement message" }],
    });
    await expect(pending).resolves.toMatchObject({
      messageId: "wamid.test",
      status: "failed",
    });
  });
});
