import { jest } from "@jest/globals";
import { loadWithMocks } from "../helpers/loadWithMocks.js";
import { createInstance } from "../helpers/models.js";

describe("outbound.worker", () => {
  let sendMessage;
  let service;
  let models;
  let timer;

  beforeEach(async () => {
    sendMessage = jest.fn(async () => ({ provider: "stub", skipped: true }));
    ({ mod: service, models } = await loadWithMocks("src/services/outbound.worker.js", {
      extraMocks: {
        "src/services/whatsapp.adapter.js": () => ({
          createWhatsAppProvider: () => ({ sendMessage }),
        }),
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

  test("startOutboundWorker dispara tick y se puede limpiar", async () => {
    jest.useFakeTimers();
    models.OutboundJob.findAll.mockResolvedValue([]);
    timer = service.startOutboundWorker();
    jest.advanceTimersByTime(5000);
    expect(models.OutboundJob.findAll).toHaveBeenCalled();
  });
});
