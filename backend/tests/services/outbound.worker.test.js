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
      if (status === "done") return [];
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

  test("startOutboundWorker dispara tick y se puede limpiar", async () => {
    jest.useFakeTimers();
    models.OutboundJob.findAll.mockResolvedValue([]);
    timer = service.startOutboundWorker();
    jest.advanceTimersByTime(5000);
    expect(models.OutboundJob.findAll).toHaveBeenCalled();
  });
});
