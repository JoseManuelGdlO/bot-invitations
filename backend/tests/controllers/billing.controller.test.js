import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks, fakePlan, fakeUser } from "../helpers/controller.js";

describe("billing.controller", () => {
  let controller;
  let models;
  let constructEvent;
  let handleStripeEvent;
  let startCheckout;
  let createPortalSession;
  let confirmCheckoutSession;
  let getStripe;

  beforeEach(async () => {
    constructEvent = jest.fn();
    handleStripeEvent = jest.fn(async () => undefined);
    startCheckout = jest.fn(async () => ({ checkoutUrl: "https://checkout.test" }));
    createPortalSession = jest.fn(async () => "https://portal.test");
    confirmCheckoutSession = jest.fn(async () => ({ status: "complete", payment_status: "paid" }));
    getStripe = jest.fn(() => ({ webhooks: { constructEvent } }));

    ({ mod: controller, models } = await loadWithMocks("src/controllers/billing.controller.js", {
      extraMocks: {
        "src/services/stripe.service.js": () => ({
          confirmCheckoutSession,
          createPortalSession,
          getStripe,
          handleStripeEvent,
          startCheckout,
          stripeEnabled: () => true,
        }),
      },
    }));
  });

  test("webhook 400 si la firma es inválida", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("bad sig");
    });
    const raw = Buffer.from("{}");
    const { res } = await callHandler(controller.webhook, {
      req: createMockReq({
        headers: { "stripe-signature": "t=1,v1=test" },
        body: raw,
        rawBody: raw,
      }),
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("webhook 200 con constructEvent mockeado", async () => {
    constructEvent.mockReturnValue({ type: "invoice.paid", data: { object: {} } });
    const raw = Buffer.from("{}");
    const { res } = await callHandler(controller.webhook, {
      req: createMockReq({
        headers: { "stripe-signature": "t=1,v1=test" },
        body: raw,
        rawBody: raw,
      }),
    });
    expect(handleStripeEvent).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  test("checkout 400 plan inválido", async () => {
    models.Plan.findByPk.mockResolvedValue(null);
    const { res } = await callHandler(controller.checkout, {
      req: createMockReq({ user: fakeUser(), body: { planId: "missing" } }),
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("checkout ok", async () => {
    models.Plan.findByPk.mockResolvedValue(fakePlan());
    const { res } = await callHandler(controller.checkout, {
      req: createMockReq({ user: fakeUser(), body: { planId: "plan_1" } }),
    });
    expect(res.json).toHaveBeenCalledWith({ checkoutUrl: "https://checkout.test" });
  });

  test("portal", async () => {
    const { res } = await callHandler(controller.portal, { req: createMockReq({ user: fakeUser() }) });
    expect(res.json).toHaveBeenCalledWith({ portalUrl: "https://portal.test" });
  });

  test("confirmSession 404", async () => {
    confirmCheckoutSession.mockResolvedValue(null);
    const { res } = await callHandler(controller.confirmSession, {
      req: createMockReq({ params: { sessionId: "cs_x" }, query: {} }),
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
