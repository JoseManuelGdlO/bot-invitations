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
    expect(sendMessage).toHaveBeenCalledWith("55", "hola");
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

  test("startOutboundWorker dispara tick y se puede limpiar", async () => {
    jest.useFakeTimers();
    models.OutboundJob.findAll.mockResolvedValue([]);
    timer = service.startOutboundWorker();
    jest.advanceTimersByTime(5000);
    expect(models.OutboundJob.findAll).toHaveBeenCalled();
  });
});
