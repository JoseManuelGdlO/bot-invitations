import { jest } from "@jest/globals";
import { loadWithMocks, fakeEvent, fakeGuest } from "../helpers/loadWithMocks.js";
import { createInstance } from "../helpers/models.js";

describe("campaign.service", () => {
  let service;
  let models;
  let deliverAiMessage;
  let assertWhatsappReady;
  let recordCampaignSendResult;
  let assertOpeningDocumentReady;

  beforeEach(async () => {
    deliverAiMessage = jest.fn(async () => ({ id: "c1" }));
    assertWhatsappReady = jest.fn(async () => undefined);
    recordCampaignSendResult = jest.fn(async () => undefined);
    assertOpeningDocumentReady = jest.fn(async (tpl) => {
      if (!tpl?.attachDocument) return { attachDocument: false };
      return {
        attachDocument: true,
        templateName: "constructor2",
        relativePath: "opening-docs/evt_1/abc.pdf",
        absolutePath: "/tmp/inv.pdf",
        fileName: "invitacion.pdf",
        mime: "application/pdf",
        size: 12,
      };
    });
    ({ mod: service, models } = await loadWithMocks("src/services/campaign.service.js", {
      extraMocks: {
        "src/services/guest-message.service.js": () => ({ deliverAiMessage }),
        "src/services/integration-resolver.service.js": () => ({ assertWhatsappReady }),
        "src/services/activity.service.js": () => ({ logActivity: jest.fn(async () => undefined) }),
        "src/services/campaign-progress.js": () => ({ recordCampaignSendResult }),
        "src/services/opening-document.service.js": () => ({
          assertOpeningDocumentReady,
          resolveOpeningDocumentFilePath: (doc) => doc?.filePath || doc?.relativePath || null,
        }),
      },
    }));
  });

  test("planCampaign now crea campaña queued y job inmediato", async () => {
    models.Guest.count.mockResolvedValue(2);
    models.Campaign.findOne.mockResolvedValue(null);
    models.Campaign.create.mockImplementation(async (data) => createInstance({ id: "cmp_1", ...data }));
    models.OutboundJob.findAll.mockResolvedValue([]);
    const event = fakeEvent();
    models.Event.findByPk.mockResolvedValue(event);

    const snap = await service.planCampaign(event, { mode: "now" }, new Date("2026-08-28T15:00:00"));

    expect(event.status).toBe("activo");
    expect(snap.status).toBe("scheduled");
    expect(assertWhatsappReady).toHaveBeenCalled();
    expect(models.Campaign.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: event.id, status: "queued", scheduledAt: "2026-08-28" }),
      expect.any(Object),
    );
    expect(models.OutboundJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "campaign.launch",
        payload: { eventId: event.id, campaignId: "cmp_1" },
      }),
      expect.any(Object),
    );
  });

  test("planCampaign now 400 si no hay invitados sin contactar", async () => {
    models.Guest.count.mockResolvedValue(0);
    await expect(service.planCampaign(fakeEvent(), { mode: "now" })).rejects.toMatchObject({
      status: 400,
      message: "No hay invitados sin contactar.",
    });
    expect(assertWhatsappReady).not.toHaveBeenCalled();
    expect(models.Campaign.create).not.toHaveBeenCalled();
  });

  test("planCampaign 400 si el adjunto está activo y falta el documento", async () => {
    models.Guest.count.mockResolvedValue(2);
    assertOpeningDocumentReady.mockRejectedValue(
      Object.assign(new Error("Activa el adjunto pero falta el documento."), { status: 400 }),
    );
    await expect(service.planCampaign(fakeEvent(), { mode: "now" })).rejects.toMatchObject({
      status: 400,
      message: "Activa el adjunto pero falta el documento.",
    });
    expect(models.Campaign.create).not.toHaveBeenCalled();
  });

  test("planCampaign now 400 si WhatsApp no está listo", async () => {
    models.Guest.count.mockResolvedValue(2);
    assertWhatsappReady.mockRejectedValue(Object.assign(new Error("WhatsApp (Meta) no está configurado."), { status: 400 }));
    await expect(service.planCampaign(fakeEvent(), { mode: "now" })).rejects.toMatchObject({
      status: 400,
    });
    expect(models.Campaign.create).not.toHaveBeenCalled();
  });

  test("planCampaign 400 si el evento está finalizado", async () => {
    await expect(
      service.planCampaign(fakeEvent({ status: "finalizado" }), { mode: "now" }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Este evento ya finalizó. No se puede iniciar una campaña.",
    });
    await expect(
      service.planCampaign(
        fakeEvent({ status: "finalizado", date: "2027-01-01" }),
        { mode: "schedule", date: "2026-12-01" },
        new Date("2026-08-28T15:00:00"),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(models.Campaign.create).not.toHaveBeenCalled();
    expect(assertWhatsappReady).not.toHaveBeenCalled();
  });

  test("planCampaign now exige WhatsApp si hay sin_contactar", async () => {
    models.Guest.count.mockResolvedValue(2);
    models.Campaign.findOne.mockResolvedValue(null);
    models.Campaign.create.mockImplementation(async (data) => createInstance({ id: "cmp_1", ...data }));
    models.OutboundJob.findAll.mockResolvedValue([]);
    models.Event.findByPk.mockResolvedValue(fakeEvent());

    await service.planCampaign(fakeEvent(), { mode: "now" });
    expect(assertWhatsappReady).toHaveBeenCalled();
  });

  test("planCampaign schedule guarda el día y el job al inicio de ese día", async () => {
    models.Guest.count.mockResolvedValue(0);
    models.Campaign.findOne.mockResolvedValue(null);
    models.Campaign.create.mockImplementation(async (data) => createInstance({ id: "cmp_1", ...data }));
    models.OutboundJob.findAll.mockResolvedValue([]);
    const event = fakeEvent({ date: "2027-01-01" });
    models.Event.findByPk.mockResolvedValue(event);

    const snap = await service.planCampaign(
      event,
      { mode: "schedule", date: "2026-12-01" },
      new Date("2026-08-28T15:00:00"),
    );

    expect(event.status).toBe("borrador");
    expect(snap.scheduledAt).toBe("2026-12-01");
    const jobAt = models.OutboundJob.create.mock.calls[0][0].scheduledAt;
    expect(jobAt.getFullYear()).toBe(2026);
    expect(jobAt.getMonth()).toBe(11);
    expect(jobAt.getDate()).toBe(1);
    expect(jobAt.getHours()).toBe(0);
    expect(assertWhatsappReady).not.toHaveBeenCalled();
  });

  test("planCampaign schedule 400 si la fecha ya pasó", async () => {
    await expect(
      service.planCampaign(
        fakeEvent(),
        { mode: "schedule", date: "2020-01-01" },
        new Date("2026-08-28T12:00:00"),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  test("planCampaign schedule 400 si la fecha es después del evento", async () => {
    await expect(
      service.planCampaign(
        fakeEvent({ date: "2027-01-01" }),
        { mode: "schedule", date: "2028-06-01" },
        new Date("2026-08-28T12:00:00"),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  test("planCampaign 409 si ya hay una campaña running", async () => {
    models.Guest.count.mockResolvedValue(2);
    models.Campaign.findOne.mockResolvedValue(
      createInstance({
        id: "cmp_run",
        eventId: "evt_1",
        status: "running",
        total: 10,
        processed: 3,
        scheduledAt: "2026-08-28",
      }),
    );
    models.Event.findByPk.mockResolvedValue(fakeEvent());

    await expect(service.planCampaign(fakeEvent(), { mode: "now" })).rejects.toMatchObject({
      status: 409,
      campaign: expect.objectContaining({ status: "running", total: 10, processed: 3 }),
    });
    expect(models.Campaign.create).not.toHaveBeenCalled();
  });

  test("planCampaign queued actualiza fecha y el job existente", async () => {
    const job = createInstance({
      id: "job_1",
      type: "campaign.launch",
      status: "queued",
      payload: { campaignId: "cmp_q", eventId: "evt_1" },
    });
    const existing = createInstance({
      id: "cmp_q",
      eventId: "evt_1",
      status: "queued",
      scheduledAt: "2026-09-01",
      total: 0,
      processed: 0,
    });
    models.Guest.count.mockResolvedValue(0);
    models.Campaign.findOne.mockResolvedValue(existing);
    models.OutboundJob.findAll.mockResolvedValue([job]);
    models.Event.findByPk.mockResolvedValue(fakeEvent());

    const snap = await service.planCampaign(
      fakeEvent({ date: "2027-01-01" }),
      { mode: "schedule", date: "2026-11-15" },
      new Date("2026-08-28T12:00:00"),
    );

    expect(snap.scheduledAt).toBe("2026-11-15");
    expect(existing.save).toHaveBeenCalled();
    expect(job.save).toHaveBeenCalled();
    expect(models.OutboundJob.create).not.toHaveBeenCalled();
  });

  test("executeCampaignLaunch reclama invitados sin_contactar y pasa campaignId", async () => {
    const campaign = createInstance({
      id: "cmp_1",
      eventId: "evt_1",
      status: "queued",
      total: 0,
      processed: 0,
    });
    const guest = fakeGuest();
    const event = fakeEvent({ status: "borrador" });
    models.Campaign.findByPk.mockResolvedValue(campaign);
    models.Campaign.update.mockResolvedValue([1]);
    models.Event.findByPk.mockResolvedValue(event);
    models.Guest.findAll.mockResolvedValue([guest]);
    models.Guest.update.mockResolvedValue([1]);
    models.AiConfig.findOne.mockResolvedValue({ openingMessage: "Hola {{nombre}}", assistantName: "Sofía" });
    models.User.findByPk.mockResolvedValue({ name: "Ana" });

    await service.executeCampaignLaunch({ payload: { campaignId: "cmp_1", eventId: "evt_1" } });

    expect(campaign.status).toBe("running");
    expect(event.status).toBe("activo");
    expect(campaign.total).toBe(1);
    expect(models.Guest.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "enviado", whatsapp: "pendiente" }),
      expect.any(Object),
    );
    expect(deliverAiMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "campaign",
        campaignId: "cmp_1",
        text: "¡Hola, buen día! Luis\nNos comunicamos de Hola Luis\nMuchas gracias.",
        hsmParams: ["Luis", "Hola Luis"],
      }),
    );
  });

  test("executeCampaignLaunch no relanza si otro worker ya tomó la campaña", async () => {
    models.Campaign.findByPk.mockResolvedValue(
      createInstance({ id: "cmp_1", eventId: "evt_1", status: "queued" }),
    );
    models.Event.findByPk.mockResolvedValue(fakeEvent());
    models.Guest.findAll.mockResolvedValue([fakeGuest()]);
    models.Campaign.update.mockResolvedValue([0]);

    await service.executeCampaignLaunch({ payload: { campaignId: "cmp_1" } });

    expect(deliverAiMessage).not.toHaveBeenCalled();
  });

  test("executeCampaignLaunch aplaza si WhatsApp no está listo", async () => {
    const campaign = createInstance({ id: "cmp_1", eventId: "evt_1", status: "queued" });
    models.Campaign.findByPk.mockResolvedValue(campaign);
    models.Event.findByPk.mockResolvedValue(fakeEvent());
    models.Guest.findAll.mockResolvedValue([fakeGuest()]);
    assertWhatsappReady.mockRejectedValue(Object.assign(new Error("sin WA"), { status: 400 }));

    const result = await service.executeCampaignLaunch({ payload: { campaignId: "cmp_1" } });

    expect(result.retryAt).toBeInstanceOf(Date);
    expect(campaign.status).toBe("queued");
    expect(models.Campaign.update).not.toHaveBeenCalled();
    expect(deliverAiMessage).not.toHaveBeenCalled();
  });

  test("executeCampaignLaunch ignora invitados ya reclamados", async () => {
    const campaign = createInstance({
      id: "cmp_1",
      eventId: "evt_1",
      status: "queued",
      total: 0,
      processed: 0,
    });
    models.Campaign.findByPk.mockResolvedValue(campaign);
    models.Campaign.update.mockResolvedValue([1]);
    models.Event.findByPk.mockResolvedValue(fakeEvent());
    models.Guest.findAll.mockResolvedValue([fakeGuest(), fakeGuest({ id: "gst_2" })]);
    models.Guest.update.mockResolvedValueOnce([1]).mockResolvedValueOnce([0]);
    models.AiConfig.findOne.mockResolvedValue({ openingMessage: "Hola", assistantName: "Sofía" });

    await service.executeCampaignLaunch({ payload: { campaignId: "cmp_1" } });

    expect(deliverAiMessage).toHaveBeenCalledTimes(1);
    expect(campaign.total).toBe(1);
  });

  test("executeCampaignLaunch no envía si el evento está finalizado", async () => {
    const campaign = createInstance({
      id: "cmp_1",
      eventId: "evt_1",
      status: "queued",
      total: 0,
      processed: 0,
    });
    models.Campaign.findByPk.mockResolvedValue(campaign);
    models.Event.findByPk.mockResolvedValue(fakeEvent({ status: "finalizado" }));
    models.Guest.findAll.mockResolvedValue([fakeGuest()]);

    await service.executeCampaignLaunch({ payload: { campaignId: "cmp_1" } });

    expect(campaign.status).toBe("done");
    expect(deliverAiMessage).not.toHaveBeenCalled();
    expect(models.Guest.update).not.toHaveBeenCalled();
    expect(models.Campaign.update).not.toHaveBeenCalled();
  });

  test("executeCampaignLaunch usa greetingVar y body de Primer contacto", async () => {
    const campaign = createInstance({
      id: "cmp_1",
      eventId: "evt_1",
      status: "queued",
      total: 0,
      processed: 0,
    });
    const guest = fakeGuest();
    models.Campaign.findByPk.mockResolvedValue(campaign);
    models.Campaign.update.mockResolvedValue([1]);
    models.Event.findByPk.mockResolvedValue(fakeEvent());
    models.Guest.findAll.mockResolvedValue([guest]);
    models.Guest.update.mockResolvedValue([1]);
    models.Template.findOne.mockResolvedValue({
      category: "Primer contacto",
      greetingVar: "evento",
      body: "Ana y Carlos.\nConfirma asistencia para {{evento}}.",
    });
    models.AiConfig.findOne.mockResolvedValue({ openingMessage: "fallback", assistantName: "Sofía" });
    models.User.findByPk.mockResolvedValue({ name: "Ana" });

    await service.executeCampaignLaunch({ payload: { campaignId: "cmp_1", eventId: "evt_1" } });

    expect(deliverAiMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "¡Hola, buen día! Boda Ana\nNos comunicamos de Ana y Carlos. Confirma asistencia para Boda Ana.\nMuchas gracias.",
        hsmParams: ["Boda Ana", "Ana y Carlos. Confirma asistencia para Boda Ana."],
      }),
    );
  });

  test("executeCampaignLaunch con documento encola constructor2 y ruta del PDF", async () => {
    const campaign = createInstance({
      id: "cmp_1",
      eventId: "evt_1",
      status: "queued",
      total: 0,
      processed: 0,
    });
    const guest = fakeGuest();
    models.Campaign.findByPk.mockResolvedValue(campaign);
    models.Campaign.update.mockResolvedValue([1]);
    models.Event.findByPk.mockResolvedValue(fakeEvent());
    models.Guest.findAll.mockResolvedValue([guest]);
    models.Guest.update.mockResolvedValue([1]);
    models.Template.findOne.mockResolvedValue({
      category: "Primer contacto",
      attachDocument: true,
      greetingVar: "nombre",
      body: "Ana y Carlos. Los esperamos.",
    });
    models.AiConfig.findOne.mockResolvedValue({ openingMessage: "fallback", assistantName: "Sofía" });
    models.User.findByPk.mockResolvedValue({ name: "Ana" });

    await service.executeCampaignLaunch({ payload: { campaignId: "cmp_1", eventId: "evt_1" } });

    expect(deliverAiMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        hsmTemplateName: "constructor2",
        hsmHeaderDocument: {
          relativePath: "opening-docs/evt_1/abc.pdf",
          filename: "invitacion.pdf",
          mime: "application/pdf",
        },
        hsmParams: ["Luis", "Ana y Carlos. Los esperamos."],
      }),
    );
  });

  test("executeCampaignLaunch con adjunto sin archivo no marca invitados enviados", async () => {
    const campaign = createInstance({
      id: "cmp_1",
      eventId: "evt_1",
      status: "queued",
      total: 0,
      processed: 0,
    });
    models.Campaign.findByPk.mockResolvedValue(campaign);
    models.Event.findByPk.mockResolvedValue(fakeEvent());
    models.Guest.findAll.mockResolvedValue([fakeGuest()]);
    models.Template.findOne.mockResolvedValue({ attachDocument: true });
    assertOpeningDocumentReady.mockRejectedValue(
      Object.assign(new Error("Activa el adjunto pero falta el documento."), { status: 400 }),
    );

    await expect(
      service.executeCampaignLaunch({ payload: { campaignId: "cmp_1" } }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Activa el adjunto pero falta el documento.",
    });
    expect(models.Campaign.update).not.toHaveBeenCalled();
    expect(models.Guest.update).not.toHaveBeenCalled();
    expect(deliverAiMessage).not.toHaveBeenCalled();
  });

  test("executeCampaignLaunch sin invitados marca done", async () => {
    const campaign = createInstance({
      id: "cmp_1",
      eventId: "evt_1",
      status: "queued",
      total: 0,
      processed: 0,
    });
    models.Campaign.findByPk.mockResolvedValue(campaign);
    models.Campaign.update.mockResolvedValue([1]);
    models.Event.findByPk.mockResolvedValue(fakeEvent());
    models.Guest.findAll.mockResolvedValue([]);

    await service.executeCampaignLaunch({ payload: { campaignId: "cmp_1" } });

    expect(campaign.status).toBe("done");
    expect(campaign.total).toBe(0);
    expect(deliverAiMessage).not.toHaveBeenCalled();
  });

  test("getEventCampaignSnapshot idle si no hay campaña", async () => {
    models.Campaign.findOne.mockResolvedValue(null);
    const snap = await service.getEventCampaignSnapshot(fakeEvent());
    expect(snap).toEqual({
      status: "idle",
      scheduledAt: null,
      launchedAt: null,
      total: 0,
      processed: 0,
      percent: 0,
    });
  });
});
