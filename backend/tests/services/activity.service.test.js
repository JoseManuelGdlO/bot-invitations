import { loadWithMocks } from "../helpers/loadWithMocks.js";

describe("activity.service", () => {
  test("logActivity crea un registro", async () => {
    const { mod, models } = await loadWithMocks("src/services/activity.service.js");
    models.Activity.create.mockResolvedValue({ id: "act_1" });
    await expect(mod.logActivity("evt_1", "Se creó el evento", "system")).resolves.toEqual({ id: "act_1" });
    expect(models.Activity.create).toHaveBeenCalledWith(
      {
        eventId: "evt_1",
        text: "Se creó el evento",
        kind: "system",
      },
      {},
    );
  });

  test("logActivity pasa transaction si se indica", async () => {
    const { mod, models } = await loadWithMocks("src/services/activity.service.js");
    const transaction = { id: "tx_1" };
    models.Activity.create.mockResolvedValue({ id: "act_1" });
    await mod.logActivity("evt_1", "Se creó el evento", "system", { transaction });
    expect(models.Activity.create).toHaveBeenCalledWith(
      {
        eventId: "evt_1",
        text: "Se creó el evento",
        kind: "system",
      },
      { transaction },
    );
  });
});
