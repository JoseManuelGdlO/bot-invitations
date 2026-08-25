import { jest } from "@jest/globals";
import { loadWithMocks, fakePlan, fakeUser } from "../helpers/loadWithMocks.js";

describe("stripe.service", () => {
  let service;
  let models;
  let stripeClient;

  beforeEach(async () => {
    ({ mod: service, models, stripeClient } = await loadWithMocks("src/services/stripe.service.js", {
      extraMocks: {
        "src/services/cancellation.service.js": () => ({
          markOpenCancellationsFromStripe: jest.fn(async () => undefined),
        }),
        "src/services/finance.service.js": () => ({
          recordPaidInvoice: jest.fn(async () => ({ id: "pay_1" })),
        }),
      },
    }));
  });

  test("stripeEnabled refleja el secret de entorno", () => {
    expect(service.stripeEnabled()).toBe(true);
  });

  test("startCheckout crea sesión si no hay suscripción activa", async () => {
    const plan = fakePlan();
    const user = fakeUser();
    stripeClient.products.retrieve.mockResolvedValue({ id: "prod_1" });
    stripeClient.products.update.mockResolvedValue({});
    stripeClient.prices.retrieve.mockResolvedValue({ id: "price_month", active: true });
    stripeClient.customers.create.mockResolvedValue({ id: "cus_1" });
    stripeClient.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.test/s" });
    const result = await service.startCheckout(user, plan, { interval: "month" });
    expect(result.checkoutUrl).toContain("checkout.stripe.test");
    expect(result.updated).toBe(false);
  });

  test("createPortalSession lanza 400 sin customer", async () => {
    await expect(service.createPortalSession(fakeUser({ stripeCustomerId: null }))).rejects.toMatchObject({
      status: 400,
    });
  });

  test("confirmCheckoutSession aplica suscripción si está pagada", async () => {
    models.User.findByPk.mockResolvedValue(fakeUser());
    stripeClient.checkout.sessions.retrieve.mockResolvedValue({
      payment_status: "paid",
      status: "complete",
      customer: "cus_1",
      subscription: "sub_1",
      metadata: { userId: "usr_test_1", planId: "plan_1", interval: "month" },
    });
    const session = await service.confirmCheckoutSession("cs_test");
    expect(session.status).toBe("complete");
    expect(models.User.findByPk).toHaveBeenCalled();
  });

  test("handleStripeEvent invoice.payment_failed marca pending", async () => {
    const user = fakeUser({ stripeSubscriptionId: "sub_1" });
    models.User.findOne.mockResolvedValue(user);
    await service.handleStripeEvent({
      type: "invoice.payment_failed",
      data: { object: { subscription: "sub_1" } },
    });
    expect(user.subscriptionStatus).toBe("pending");
  });
});
