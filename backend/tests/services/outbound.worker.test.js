import { jest } from "@jest/globals";
import { Op } from "sequelize";
import { loadWithMocks } from "../helpers/loadWithMocks.js";
import { createInstance } from "../helpers/models.js";

function opVal(obj, op) {
  if (!obj || typeof obj !== "object") return undefined;
  return obj[op];
}

function jobMatchesWhere(job, where = {}) {
  if (where.type && job.type !== where.type) return false;
  if (typeof where.status === "string" && job.status !== where.status) return false;
  const idNe = opVal(where.id, Op.ne);
  if (idNe && job.id === idNe) return false;
  if (where.scheduledAt) {
    const at = new Date(job.scheduledAt).getTime();
    const lte = opVal(where.scheduledAt, Op.lte);
    const lt = opVal(where.scheduledAt, Op.lt);
    if (lte != null && at > new Date(lte).getTime()) return false;
    if (lt != null && at >= new Date(lt).getTime()) return false;
  }
  if (where.updatedAt) {
    const at = new Date(job.updatedAt || 0).getTime();
    const gte = opVal(where.updatedAt, Op.gte);
    if (gte != null && at < new Date(gte).getTime()) return false;
  }
  return true;
}

function stubOwnerQueue(models, jobs, events) {
  models.Guest.findByPk.mockImplementation(async (id) => createInstance({ id, phone: "6183218624" }));
  models.Event.findByPk.mockImplementation(async (id) => {
    const event = events.find((row) => row.id === id);
    return event ? { ownerId: event.ownerId } : null;
  });
  models.Event.findAll.mockImplementation(async (opts = {}) => {
    if (opts.where?.ownerId) {
      return events.filter((row) => row.ownerId === opts.where.ownerId).map((row) => ({ id: row.id }));
    }
    return events.map((row) => ({ id: row.id, ownerId: row.ownerId }));
  });
  models.OutboundJob.findAll.mockImplementation(async (opts = {}) =>
    jobs.filter((job) => jobMatchesWhere(job, opts.where)),
  );
}

function campaignJob({ id, eventId, guestId, to, scheduledAt = new Date(), status = "queued", kind = "campaign" }) {
  return createInstance({
    id,
    type: "whatsapp.send",
    status,
    attempts: 0,
    scheduledAt,
    updatedAt: scheduledAt,
    payload: { to, text: "hola", kind, eventId, guestId },
  });
}

describe("outbound.worker", () => {
  let sendMessage;
  let service;
  let models;
  let timer;
  let executeCampaignLaunch;
  let recordCampaignSendResult;

  beforeEach(async () => {
    sendMessage = jest.fn(async () => ({ provider: "stub", skipped: true }));
    executeCampaignLaunch = jest.fn(async () => ({}));
    recordCampaignSendResult = jest.fn(async () => undefined);
    ({ mod: service, models } = await loadWithMocks("src/services/outbound.worker.js", {
      extraMocks: {
        "src/services/whatsapp.adapter.js": () => ({
          createWhatsAppProvider: () => ({ sendMessage }),
        }),
        "src/services/campaign.service.js": () => ({ executeCampaignLaunch }),
        "src/services/campaign-progress.js": () => ({ recordCampaignSendResult }),
      },
    }));
  });

  afterEach(() => {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("enqueueJob crea un job queued", async () => {
    models.OutboundJob.create.mockResolvedValue({ id: "job_1" });
    await service.enqueueJob("whatsapp.send", { to: "55", text: "hola" });
    expect(models.OutboundJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "whatsapp.send", status: "queued" }),
    );
  });

  test("processJob follow_up envía como el resto de masivos", async () => {
    sendMessage.mockResolvedValueOnce({ provider: "stub", skipped: false });
    const job = createInstance({
      type: "whatsapp.send",
      attempts: 0,
      payload: { to: "6183218624", text: "hola", kind: "follow_up" },
    });
    await service.processJob(job);
    expect(sendMessage).toHaveBeenCalledWith("5216183218624", "hola", expect.any(Object));
    expect(job.update).toHaveBeenCalledWith(expect.objectContaining({ status: "done" }));
  });

  test("processJob whatsapp.send reenvía hsmParams al provider", async () => {
    sendMessage.mockResolvedValueOnce({ provider: "stub", skipped: false });
    const job = createInstance({
      type: "whatsapp.send",
      attempts: 0,
      payload: {
        to: "6183218624",
        text: "compuesto",
        kind: "campaign",
        eventId: "evt_1",
        guestId: "gst_1",
        hsmParams: ["Luis", "copy libre"],
      },
    });
    await service.processJob(job);
    expect(sendMessage).toHaveBeenCalledWith(
      "5216183218624",
      "compuesto",
      expect.objectContaining({
        eventId: "evt_1",
        guestId: "gst_1",
        hsmParams: ["Luis", "copy libre"],
      }),
    );
  });

  test("processJob seguimiento no se salta", async () => {
    sendMessage.mockResolvedValueOnce({ provider: "stub", skipped: false });
    const job = createInstance({
      type: "whatsapp.send",
      attempts: 0,
      payload: { to: "6183218624", text: "hola", kind: "seguimiento" },
    });
    await service.processJob(job);
    expect(sendMessage).toHaveBeenCalledWith("5216183218624", "hola", expect.any(Object));
    expect(job.update).toHaveBeenCalledWith(expect.objectContaining({ status: "done" }));
  });

  test("processJob marca skipped cuando el stub no envía", async () => {
    const job = createInstance({
      type: "whatsapp.send",
      attempts: 0,
      payload: { to: "55", text: "hola" },
    });
    await service.processJob(job);
    expect(sendMessage).toHaveBeenCalledWith("55", "hola", expect.any(Object));
    expect(job.update).toHaveBeenCalledWith(expect.objectContaining({ status: "skipped" }));
  });

  test("processJob tipo desconocido se salta", async () => {
    const job = createInstance({ type: "unknown", attempts: 0, payload: {} });
    await service.processJob(job);
    expect(job.update).toHaveBeenCalledWith(expect.objectContaining({ status: "skipped" }));
  });

  test("processJob campaign.launch ejecuta y marca done", async () => {
    const job = createInstance({
      id: "launch_1",
      type: "campaign.launch",
      attempts: 0,
      payload: { eventId: "evt_1", campaignId: "cmp_1" },
    });
    await service.processJob(job);
    expect(executeCampaignLaunch).toHaveBeenCalledWith(job);
    expect(job.update).toHaveBeenCalledWith(expect.objectContaining({ status: "done" }));
  });

  test("processJob campaign.launch reencola si WhatsApp no está listo", async () => {
    const retryAt = new Date("2026-08-28T16:00:00");
    executeCampaignLaunch.mockResolvedValueOnce({ retryAt, reason: "sin WA" });
    const job = createInstance({
      id: "launch_1",
      type: "campaign.launch",
      attempts: 0,
      payload: { eventId: "evt_1", campaignId: "cmp_1" },
    });
    await service.processJob(job);
    expect(job.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "queued", scheduledAt: retryAt, lastError: "sin WA" }),
    );
  });

  test("processJob campaign.launch no relanza si execute no hace nada", async () => {
    executeCampaignLaunch.mockResolvedValueOnce({});
    const job = createInstance({
      type: "campaign.launch",
      attempts: 0,
      payload: { campaignId: "cmp_1" },
    });
    await service.processJob(job);
    expect(executeCampaignLaunch).toHaveBeenCalledTimes(1);
    expect(job.update).toHaveBeenCalledWith(expect.objectContaining({ status: "done" }));
  });

  test("processJob whatsapp.send de campaña cuenta done failed y skipped", async () => {
    sendMessage.mockResolvedValueOnce({ provider: "stub", skipped: false });
    const doneJob = createInstance({
      type: "whatsapp.send",
      attempts: 0,
      payload: { to: "6183218624", text: "hola", kind: "campaign", campaignId: "cmp_1", guestId: "gst_1" },
    });
    await service.processJob(doneJob);
    expect(recordCampaignSendResult).toHaveBeenCalledWith("cmp_1");

    recordCampaignSendResult.mockClear();
    sendMessage.mockRejectedValueOnce(new Error("boom"));
    const failedJob = createInstance({
      type: "whatsapp.send",
      attempts: 0,
      payload: { to: "6183218624", text: "hola", kind: "campaign", campaignId: "cmp_1", guestId: "gst_1" },
    });
    await service.processJob(failedJob);
    expect(recordCampaignSendResult).toHaveBeenCalledWith("cmp_1");

    recordCampaignSendResult.mockClear();
    const skippedJob = createInstance({
      type: "whatsapp.send",
      attempts: 0,
      payload: { to: "", text: "hola", kind: "campaign", campaignId: "cmp_1" },
    });
    await service.processJob(skippedJob);
    expect(recordCampaignSendResult).toHaveBeenCalledWith("cmp_1");
  });

  test("processJob captura errores como failed", async () => {
    sendMessage.mockRejectedValueOnce(new Error("boom"));
    const job = createInstance({
      type: "whatsapp.send",
      attempts: 0,
      payload: { to: "55", text: "hola" },
    });
    await service.processJob(job);
    expect(job.update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", lastError: "boom" }));
  });

  test("processJob no reenvía si otro worker ya lo tomó", async () => {
    models.OutboundJob.update.mockResolvedValueOnce([0]);
    const job = createInstance({
      id: "job_claimed",
      type: "whatsapp.send",
      status: "queued",
      attempts: 0,
      payload: { to: "55", text: "hola" },
    });
    await service.processJob(job);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(job.status).toBe("queued");
  });

  test("processJob prefija 521 en números de 10 dígitos", async () => {
    sendMessage.mockResolvedValueOnce({ provider: "stub", skipped: false });
    const job = createInstance({
      type: "whatsapp.send",
      attempts: 0,
      payload: { to: "6183218624", text: "hola" },
    });
    await service.processJob(job);
    expect(sendMessage).toHaveBeenCalledWith("5216183218624", "hola", expect.any(Object));
  });

  test("processJob reescribe JID de 10 dígitos con 521", async () => {
    sendMessage.mockResolvedValueOnce({ provider: "stub", skipped: false });
    models.Guest.findByPk.mockResolvedValueOnce(
      createInstance({ id: "g1", phone: "6181020927", whatsappChatId: "6181020927@s.whatsapp.net" }),
    );
    const job = createInstance({
      type: "whatsapp.send",
      attempts: 0,
      payload: { to: "6181020927", text: "hola", guestId: "g1" },
    });
    await service.processJob(job);
    expect(sendMessage).toHaveBeenCalledWith("5216181020927@s.whatsapp.net", "hola", expect.any(Object));
  });

  test("enqueueJob masivo programa scheduledAt en cascada", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0);
    models.Event.findByPk.mockResolvedValue({ ownerId: "owner_1" });
    try {
      await service.enqueueJob("whatsapp.send", {
        kind: "campaign",
        eventId: "evt_1",
        to: "6183218624",
        text: "hola",
      });
      await service.enqueueJob("whatsapp.send", {
        kind: "campaign",
        eventId: "evt_1",
        to: "6181111111",
        text: "hola",
      });
      const firstAt = new Date(models.OutboundJob.create.mock.calls[0][0].scheduledAt).getTime();
      const secondAt = new Date(models.OutboundJob.create.mock.calls[1][0].scheduledAt).getTime();
      expect(secondAt - firstAt).toBeGreaterThanOrEqual(15000);
      expect(secondAt - firstAt).toBeLessThan(16000);
    } finally {
      Math.random.mockRestore();
    }
  });

  test("enqueueJob follow_up comparte la cascada de jitter con campaña", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0);
    models.Event.findByPk.mockResolvedValue({ ownerId: "owner_1" });
    try {
      await service.enqueueJob("whatsapp.send", {
        kind: "campaign",
        eventId: "evt_1",
        to: "6183218624",
        text: "hola",
      });
      await service.enqueueJob("whatsapp.send", {
        kind: "follow_up",
        eventId: "evt_1",
        to: "6181111111",
        text: "recordatorio",
      });
      const firstAt = new Date(models.OutboundJob.create.mock.calls[0][0].scheduledAt).getTime();
      const secondAt = new Date(models.OutboundJob.create.mock.calls[1][0].scheduledAt).getTime();
      expect(secondAt - firstAt).toBeGreaterThanOrEqual(15000);
      expect(secondAt - firstAt).toBeLessThan(16000);
    } finally {
      Math.random.mockRestore();
    }
  });

  test("enqueueJob con scheduledAt no hereda slot masivo", async () => {
    const at = new Date("2026-08-25T21:34:00.000Z");
    models.Event.findByPk.mockResolvedValue({ ownerId: "owner_1" });
    await service.enqueueJob(
      "whatsapp.send",
      { kind: "campaign", eventId: "evt_1", to: "6183218624", text: "hola" },
      at,
    );
    expect(models.OutboundJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledAt: at }),
    );
  });

  test("tickWorker envía un masivo y aplaza el resto con jitter", async () => {
    sendMessage.mockResolvedValue({ provider: "stub", skipped: false });
    jest.spyOn(Math, "random").mockReturnValue(0);
    const started = Date.now();
    const now = new Date();
    const job1 = createInstance({
      id: "job_1",
      type: "whatsapp.send",
      status: "queued",
      attempts: 0,
      scheduledAt: now,
      payload: {
        to: "6183218624",
        text: "hola",
        kind: "campaign",
        eventId: "evt_1",
        guestId: "g1",
      },
    });
    const job2 = createInstance({
      id: "job_2",
      type: "whatsapp.send",
      status: "queued",
      attempts: 0,
      scheduledAt: now,
      payload: {
        to: "6181111111",
        text: "hola",
        kind: "campaign",
        eventId: "evt_1",
        guestId: "g2",
      },
    });

    models.Guest.findByPk.mockImplementation(async (id) => {
      if (id === "g1") return createInstance({ id: "g1", phone: "6183218624" });
      if (id === "g2") return createInstance({ id: "g2", phone: "6181111111" });
      return null;
    });
    models.Event.findAll.mockImplementation(async (opts = {}) => {
      if (opts.where?.ownerId) return [{ id: "evt_1" }];
      return [{ id: "evt_1", ownerId: "owner_1" }];
    });
    models.OutboundJob.findAll.mockImplementation(async (opts = {}) => {
      const status = opts.where?.status;
      if (status && typeof status === "object") return [];
      if (status === "queued" && opts.where?.type === "whatsapp.send") return [job2];
      if (status === "queued") return [job1, job2];
      return [];
    });

    try {
      await service.tickWorker();

      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(sendMessage).toHaveBeenCalledWith("5216183218624", "hola", expect.any(Object));
      expect(job1.status).toBe("done");
      expect(job2.status).toBe("queued");
      const deferredAt = new Date(job2.scheduledAt).getTime();
      expect(deferredAt - started).toBeGreaterThanOrEqual(15000 - 100);
      expect(deferredAt - started).toBeLessThan(16000);
    } finally {
      Math.random.mockRestore();
    }
  });

  test("tickWorker aplaza el resto con jitter si el envío falla", async () => {
    sendMessage.mockRejectedValueOnce(new Error("boom"));
    jest.spyOn(Math, "random").mockReturnValue(0);
    const started = Date.now();
    const now = new Date();
    const job1 = createInstance({
      id: "job_fail_1",
      type: "whatsapp.send",
      status: "queued",
      attempts: 0,
      scheduledAt: now,
      payload: {
        to: "6183218624",
        text: "hola",
        kind: "campaign",
        eventId: "evt_1",
        guestId: "g1",
      },
    });
    const job2 = createInstance({
      id: "job_fail_2",
      type: "whatsapp.send",
      status: "queued",
      attempts: 0,
      scheduledAt: now,
      payload: {
        to: "6181111111",
        text: "hola",
        kind: "campaign",
        eventId: "evt_1",
        guestId: "g2",
      },
    });

    models.Guest.findByPk.mockImplementation(async (id) => {
      if (id === "g1") return createInstance({ id: "g1", phone: "6183218624" });
      if (id === "g2") return createInstance({ id: "g2", phone: "6181111111" });
      return null;
    });
    models.Event.findAll.mockImplementation(async (opts = {}) => {
      if (opts.where?.ownerId) return [{ id: "evt_1" }];
      return [{ id: "evt_1", ownerId: "owner_1" }];
    });
    models.OutboundJob.findAll.mockImplementation(async (opts = {}) => {
      const status = opts.where?.status;
      if (status && typeof status === "object") return [];
      if (status === "queued" && opts.where?.type === "whatsapp.send") return [job2];
      if (status === "queued") return [job1, job2];
      return [];
    });

    try {
      await service.tickWorker();

      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(job1.status).toBe("failed");
      expect(job2.status).toBe("queued");
      const deferredAt = new Date(job2.scheduledAt).getTime();
      expect(deferredAt - started).toBeGreaterThanOrEqual(15000 - 100);
      expect(deferredAt - started).toBeLessThan(16000);
    } finally {
      Math.random.mockRestore();
    }
  });

  test("tickWorker no dispara ráfaga si falta ownerId", async () => {
    sendMessage.mockResolvedValue({ provider: "stub", skipped: false });
    const now = new Date();
    const job1 = createInstance({
      id: "job_u1",
      type: "whatsapp.send",
      status: "queued",
      attempts: 0,
      scheduledAt: now,
      payload: { to: "6183218624", text: "hola", kind: "campaign" },
    });
    const job2 = createInstance({
      id: "job_u2",
      type: "whatsapp.send",
      status: "queued",
      attempts: 0,
      scheduledAt: now,
      payload: { to: "6181111111", text: "hola", kind: "campaign" },
    });
    models.Event.findAll.mockResolvedValue([]);
    models.OutboundJob.findAll.mockImplementation(async (opts = {}) => {
      const status = opts.where?.status;
      if (status && typeof status === "object") return [];
      if (status === "queued") return [job1, job2];
      return [];
    });

    await service.tickWorker();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(job1.status).toBe("done");
    expect(job2.status).toBe("queued");
    const deferredAt = new Date(job2.scheduledAt).getTime();
    expect(deferredAt).toBeGreaterThan(now.getTime());
  });

  test("tickWorker escala los masivos due y no comparte scheduledAt", async () => {
    sendMessage.mockResolvedValue({ provider: "stub", skipped: false });
    jest.spyOn(Math, "random").mockReturnValue(0);
    const now = new Date();
    const payload = (to, guestId) => ({
      to,
      text: "hola",
      kind: "campaign",
      eventId: "evt_1",
      guestId,
    });
    const job1 = createInstance({
      id: "job_s1",
      type: "whatsapp.send",
      status: "queued",
      attempts: 0,
      scheduledAt: now,
      payload: payload("6183218624", "g1"),
    });
    const job2 = createInstance({
      id: "job_s2",
      type: "whatsapp.send",
      status: "queued",
      attempts: 0,
      scheduledAt: now,
      payload: payload("6181111111", "g2"),
    });
    const job3 = createInstance({
      id: "job_s3",
      type: "whatsapp.send",
      status: "queued",
      attempts: 0,
      scheduledAt: now,
      payload: payload("6182222222", "g3"),
    });
    models.Guest.findByPk.mockImplementation(async (id) => createInstance({ id, phone: "6183218624" }));
    models.Event.findAll.mockImplementation(async (opts = {}) => {
      if (opts.where?.ownerId) return [{ id: "evt_1" }];
      return [{ id: "evt_1", ownerId: "owner_1" }];
    });
    models.OutboundJob.findAll.mockImplementation(async (opts = {}) => {
      const status = opts.where?.status;
      if (status && typeof status === "object") return [];
      if (status === "queued" && opts.where?.type === "whatsapp.send") return [job2, job3];
      if (status === "queued") return [job1, job2, job3];
      return [];
    });

    try {
      await service.tickWorker();
      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(job1.status).toBe("done");
      expect(job2.status).toBe("queued");
      expect(job3.status).toBe("queued");
      expect(new Date(job2.scheduledAt).getTime()).not.toBe(new Date(job3.scheduledAt).getTime());
    } finally {
      Math.random.mockRestore();
    }
  });

  test("enqueueJob de dos campañas del mismo owner comparte la cascada de jitter", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0);
    models.Event.findByPk.mockImplementation(async (id) => ({ ownerId: "owner_1" }));
    try {
      await service.enqueueJob("whatsapp.send", {
        kind: "campaign",
        eventId: "evt_a",
        to: "6183218624",
        text: "hola",
      });
      await service.enqueueJob("whatsapp.send", {
        kind: "campaign",
        eventId: "evt_b",
        to: "6181111111",
        text: "hola",
      });
      const firstAt = new Date(models.OutboundJob.create.mock.calls[0][0].scheduledAt).getTime();
      const secondAt = new Date(models.OutboundJob.create.mock.calls[1][0].scheduledAt).getTime();
      expect(secondAt - firstAt).toBeGreaterThanOrEqual(15000);
      expect(secondAt - firstAt).toBeLessThan(16000);
    } finally {
      Math.random.mockRestore();
    }
  });

  test("tickWorker envía un follow_up y aplaza el resto con jitter", async () => {
    sendMessage.mockResolvedValue({ provider: "stub", skipped: false });
    jest.spyOn(Math, "random").mockReturnValue(0);
    const started = Date.now();
    const now = new Date();
    const jobA = campaignJob({
      id: "job_fu_a",
      eventId: "evt_1",
      guestId: "ga",
      to: "6183218624",
      scheduledAt: now,
      kind: "follow_up",
    });
    const jobB = campaignJob({
      id: "job_fu_b",
      eventId: "evt_1",
      guestId: "gb",
      to: "6181111111",
      scheduledAt: now,
      kind: "follow_up",
    });
    stubOwnerQueue(models, [jobA, jobB], [{ id: "evt_1", ownerId: "owner_1" }]);

    try {
      await service.tickWorker();

      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(jobA.status).toBe("done");
      expect(jobB.status).toBe("queued");
      const deferredAt = new Date(jobB.scheduledAt).getTime();
      expect(deferredAt - started).toBeGreaterThanOrEqual(15000 - 100);
      expect(deferredAt - started).toBeLessThan(16000);
    } finally {
      Math.random.mockRestore();
    }
  });

  test("tickWorker con dos campañas del mismo owner envía una y aplaza la otra", async () => {
    sendMessage.mockResolvedValue({ provider: "stub", skipped: false });
    jest.spyOn(Math, "random").mockReturnValue(0);
    const started = Date.now();
    const now = new Date();
    const jobA = campaignJob({
      id: "job_camp_a",
      eventId: "evt_a",
      guestId: "ga",
      to: "6183218624",
      scheduledAt: now,
    });
    const jobB = campaignJob({
      id: "job_camp_b",
      eventId: "evt_b",
      guestId: "gb",
      to: "6181111111",
      scheduledAt: now,
    });
    stubOwnerQueue(
      models,
      [jobA, jobB],
      [
        { id: "evt_a", ownerId: "owner_1" },
        { id: "evt_b", ownerId: "owner_1" },
      ],
    );

    try {
      await service.tickWorker();

      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(jobA.status).toBe("done");
      expect(jobB.status).toBe("queued");
      const deferredAt = new Date(jobB.scheduledAt).getTime();
      expect(deferredAt - started).toBeGreaterThanOrEqual(15000 - 100);
      expect(deferredAt - started).toBeLessThan(16000);
    } finally {
      Math.random.mockRestore();
    }
  });

  test("tickWorker en dos ticks seguidos no manda el segundo masivo", async () => {
    sendMessage.mockResolvedValue({ provider: "stub", skipped: false });
    jest.spyOn(Math, "random").mockReturnValue(0);
    const now = new Date();
    const job1 = campaignJob({
      id: "job_tick_1",
      eventId: "evt_1",
      guestId: "g1",
      to: "6183218624",
      scheduledAt: now,
    });
    const job2 = campaignJob({
      id: "job_tick_2",
      eventId: "evt_1",
      guestId: "g2",
      to: "6181111111",
      scheduledAt: now,
    });
    stubOwnerQueue(models, [job1, job2], [{ id: "evt_1", ownerId: "owner_1" }]);

    try {
      await service.tickWorker();
      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(job1.status).toBe("done");
      expect(job2.status).toBe("queued");
      expect(new Date(job2.scheduledAt).getTime()).toBeGreaterThan(Date.now());

      await service.tickWorker();

      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(job2.status).toBe("queued");
    } finally {
      Math.random.mockRestore();
    }
  });

  test("tickWorker aplaza el 21º masivo por tope horario", async () => {
    sendMessage.mockResolvedValue({ provider: "stub", skipped: false });
    const hourAgo = new Date(Date.now() - 2 * 60 * 1000);
    const done = Array.from({ length: 20 }, (_, i) =>
      campaignJob({
        id: `job_done_${i}`,
        eventId: "evt_1",
        guestId: `gd${i}`,
        to: "6183218624",
        scheduledAt: hourAgo,
        status: "done",
      }),
    );
    const pending = campaignJob({
      id: "job_21",
      eventId: "evt_1",
      guestId: "g21",
      to: "6181111111",
      scheduledAt: new Date(),
    });
    stubOwnerQueue(models, [...done, pending], [{ id: "evt_1", ownerId: "owner_1" }]);

    await service.tickWorker();

    expect(sendMessage).not.toHaveBeenCalled();
    expect(pending.status).toBe("queued");
    expect(new Date(pending.scheduledAt).getTime()).toBeGreaterThan(Date.now());
  });

  test("tickWorker deja pasar un reply aunque el tope horario de masivos esté lleno", async () => {
    sendMessage.mockResolvedValue({ provider: "stub", skipped: false });
    const sentAt = new Date(Date.now() - 2 * 60 * 1000);
    const done = Array.from({ length: 20 }, (_, i) =>
      campaignJob({
        id: `job_bulk_${i}`,
        eventId: "evt_1",
        guestId: `gd${i}`,
        to: "6183218624",
        scheduledAt: sentAt,
        status: "done",
      }),
    );
    const reply = campaignJob({
      id: "job_reply",
      eventId: "evt_1",
      guestId: "gr",
      to: "6181111111",
      scheduledAt: new Date(),
      kind: "reply",
    });
    stubOwnerQueue(models, [...done, reply], [{ id: "evt_1", ownerId: "owner_1" }]);

    await service.tickWorker();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(reply.status).toBe("done");
  });

  test("startOutboundWorker dispara tick y se puede limpiar", async () => {
    jest.useFakeTimers();
    models.OutboundJob.findAll.mockResolvedValue([]);
    timer = service.startOutboundWorker();
    jest.advanceTimersByTime(5000);
    expect(models.OutboundJob.findAll).toHaveBeenCalled();
  });
});
