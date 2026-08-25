import { jest } from "@jest/globals";
import { loadWithMocks, fakeUser } from "../helpers/loadWithMocks.js";
import { createInstance } from "../helpers/models.js";

describe("cancellation.service", () => {
  let service;
  let models;

  beforeEach(async () => {
    ({ mod: service, models } = await loadWithMocks("src/services/cancellation.service.js", {
      extraMocks: {
        "src/services/stripe.service.js": () => ({
          scheduleCancelAtPeriodEnd: jest.fn(async () => ({ scheduled: false, periodEnd: new Date() })),
        }),
      },
    }));
  });

  test("requestCancellation valida motivo corto", async () => {
    await expect(service.requestCancellation(fakeUser(), "corto")).rejects.toMatchObject({ status: 400 });
  });

  test("requestCancellation crea solicitud pending", async () => {
    models.CancellationRequest.findOne.mockResolvedValue(null);
    models.CancellationRequest.create.mockResolvedValue(createInstance({ id: "c1", status: "pending" }));
    const row = await service.requestCancellation(fakeUser(), "Ya no usaré la plataforma este año");
    expect(row.status).toBe("pending");
  });

  test("withdrawCancellation 404 si no hay pendiente", async () => {
    models.CancellationRequest.findOne.mockResolvedValue(null);
    await expect(service.withdrawCancellation(fakeUser())).rejects.toMatchObject({ status: 404 });
  });

  test("decideCancellation aprueba y programa Stripe", async () => {
    const row = createInstance({ id: "c1", status: "pending", userId: "usr_test_1" });
    models.User.findByPk.mockResolvedValue(fakeUser());
    const updated = await service.decideCancellation(row, { id: "admin_1" }, { approve: true, note: "ok" });
    expect(updated.status).toBe("approved");
  });
});
