import { jest } from "@jest/globals";
import { loadWithMocks, fakeEvent } from "../helpers/loadWithMocks.js";
import { createInstance } from "../helpers/models.js";

describe("event-status.service", () => {
  let service;
  let models;
  let logActivity;

  beforeEach(async () => {
    logActivity = jest.fn(async () => undefined);
    ({ mod: service, models } = await loadWithMocks("src/services/event-status.service.js", {
      extraMocks: {
        "src/services/activity.service.js": () => ({ logActivity }),
      },
    }));
  });

  test("isEventDatePassed true al día siguiente del evento", () => {
    expect(service.isEventDatePassed("2026-08-28", new Date("2026-08-29T10:00:00"))).toBe(true);
  });

  test("isEventDatePassed false el mismo día del evento", () => {
    expect(service.isEventDatePassed("2026-08-28", new Date("2026-08-28T23:59:00"))).toBe(false);
  });

  test("activateEvent pasa borrador a activo", async () => {
    const event = fakeEvent({ status: "borrador" });
    const changed = await service.activateEvent(event);
    expect(changed).toBe(true);
    expect(event.status).toBe("activo");
    expect(event.save).toHaveBeenCalled();
  });

  test("activateEvent no toca activo ni finalizado", async () => {
    const active = fakeEvent({ status: "activo" });
    const finalized = fakeEvent({ status: "finalizado" });
    expect(await service.activateEvent(active)).toBe(false);
    expect(await service.activateEvent(finalized)).toBe(false);
    expect(active.save).not.toHaveBeenCalled();
    expect(finalized.save).not.toHaveBeenCalled();
  });

  test("finalizePastEvents marca finalizado y registra actividad", async () => {
    const past = createInstance(fakeEvent({ id: "evt_past", date: "2020-01-01", status: "activo" }));
    const future = createInstance(fakeEvent({ id: "evt_future", date: "2099-01-01", status: "borrador" }));
    models.Event.findAll.mockResolvedValue([past, future]);

    const count = await service.finalizePastEvents(new Date("2026-08-28T12:00:00"));

    expect(count).toBe(1);
    expect(past.status).toBe("finalizado");
    expect(future.status).toBe("borrador");
    expect(logActivity).toHaveBeenCalledWith(
      "evt_past",
      expect.stringContaining("finalizó"),
      "system",
    );
  });
});
