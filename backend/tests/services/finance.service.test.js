import { jest } from "@jest/globals";
import { loadWithMocks, fakePlan, fakeUser } from "../helpers/loadWithMocks.js";
import { createInstance } from "../helpers/models.js";

describe("finance.service", () => {
  test("recordPaidInvoice ignora facturas sin id", async () => {
    const { mod } = await loadWithMocks("src/services/finance.service.js", {
      extraMocks: {
        "src/services/stripe.service.js": () => ({
          stripeEnabled: () => false,
          getStripe: () => null,
        }),
      },
    });
    await expect(mod.recordPaidInvoice({})).resolves.toBeNull();
  });

  test("recordPaidInvoice hace findOrCreate", async () => {
    const { mod, models } = await loadWithMocks("src/services/finance.service.js", {
      extraMocks: {
        "src/services/stripe.service.js": () => ({
          stripeEnabled: () => false,
          getStripe: () => null,
        }),
      },
    });
    const payment = createInstance({ id: "pay_1" });
    models.Payment.findOrCreate.mockResolvedValue([payment, true]);
    models.User.findByPk.mockResolvedValue(fakeUser({ stripeCustomerId: "cus_1" }));
    const row = await mod.recordPaidInvoice({
      id: "in_1",
      amount_paid: 120000,
      currency: "mxn",
      status: "paid",
      metadata: { userId: "usr_test_1" },
      created: Math.floor(Date.now() / 1000),
    });
    expect(row.id).toBe("pay_1");
  });

  test("getFinanceSnapshot arma MRR estimado sin Stripe", async () => {
    const { mod, models } = await loadWithMocks("src/services/finance.service.js", {
      extraMocks: {
        "src/services/stripe.service.js": () => ({
          stripeEnabled: () => false,
          getStripe: () => null,
        }),
      },
    });
    const plan = fakePlan();
    models.Plan.findAll.mockResolvedValue([plan]);
    models.User.findAll.mockResolvedValue([fakeUser({ plan })]);
    models.Payment.findAll.mockResolvedValue([]);
    const snap = await mod.getFinanceSnapshot();
    expect(snap.estimatedMrrMxn).toBe(1200);
    expect(snap.subscribers.active).toBe(1);
    expect(snap.stripe.available).toBe(false);
  });
});
