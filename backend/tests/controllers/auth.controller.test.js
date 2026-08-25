import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks, fakePlan, fakeUser } from "../helpers/controller.js";

describe("auth.controller", () => {
  let controller;
  let models;
  let startCheckout;
  let scheduleCancelAtPeriodEnd;

  beforeEach(async () => {
    startCheckout = jest.fn(async () => ({ checkoutUrl: "https://checkout.test", updated: false }));
    scheduleCancelAtPeriodEnd = jest.fn(async () => ({ scheduled: true, periodEnd: new Date() }));

    ({ mod: controller, models } = await loadWithMocks("src/controllers/auth.controller.js", {
      extraMocks: {
        bcryptjs: () => ({
          default: {
            hash: jest.fn(async () => "hashed_password"),
            compare: jest.fn(async (plain, hash) => plain === "secret12" || hash === "valid_hash"),
          },
          hash: jest.fn(async () => "hashed_password"),
          compare: jest.fn(async (plain, hash) => plain === "secret12" || hash === "valid_hash"),
        }),
        "src/services/stripe.service.js": () => ({
          stripeEnabled: () => false,
          startCheckout,
          scheduleCancelAtPeriodEnd,
          createPortalSession: jest.fn(),
          syncStripePlans: jest.fn(),
          handleStripeEvent: jest.fn(),
          getStripe: jest.fn(),
        }),
        "src/services/state.service.js": () => ({
          loadUserState: jest.fn(async () => ({ events: [], guests: [] })),
        }),
        "src/services/plans.service.js": () => ({
          serializePlan: jest.fn((p) => p),
          settleExpiredSubscription: jest.fn(async () => undefined),
          getPlanUsage: jest.fn(async () => ({ events: 0, guests: 0 })),
        }),
        "src/services/cancellation.service.js": () => ({
          getLatestCancellation: jest.fn(async () => null),
          serializeCancellation: jest.fn(() => null),
        }),
      },
    }));

    models.RefreshToken.create.mockResolvedValue({});
    models.PasswordReset.create.mockResolvedValue({});
  });

  test("listPlans serializa planes", async () => {
    models.Plan.findAll.mockResolvedValue([fakePlan()]);
    const { res } = await callHandler(controller.listPlans);
    expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ slug: "estudio" })]);
  });

  test("register 400 si faltan datos", async () => {
    const { res } = await callHandler(controller.register, { req: createMockReq({ body: {} }) });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("register 201 crea usuario sin Stripe", async () => {
    const plan = fakePlan({ id: "plan_1", slug: "estudio" });
    const user = fakeUser({ id: "usr_reg_1", planId: "plan_1", email: "ana@test.com" });

    models.Plan.findByPk.mockResolvedValue(plan);
    models.User.findOne.mockResolvedValue(null);
    models.User.create.mockResolvedValue(user);

    const { res } = await callHandler(controller.register, {
      req: createMockReq({
        body: {
          name: "Ana",
          email: "ana@test.com",
          password: "secret12",
          planId: "plan_1",
          phone: "5511111111",
          state: "CDMX",
          businessName: "Studio Ana",
        },
      }),
    });

    expect(models.User.create).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(startCheckout).not.toHaveBeenCalled();
  });

  test("login 401 con credenciales inválidas", async () => {
    models.User.findOne.mockResolvedValue(null);
    const { res } = await callHandler(controller.login, {
      req: createMockReq({ body: { email: "x@y.com", password: "nope" } }),
    });
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("login ok con password válido", async () => {
    const user = fakeUser({ passwordHash: "valid_hash" });
    models.User.findOne.mockResolvedValue(user);
    models.Plan.findByPk.mockResolvedValue(fakePlan());

    const { res } = await callHandler(controller.login, {
      req: createMockReq({ body: { email: "ana@test.com", password: "secret12" } }),
    });
    expect(models.EventMember.update).toHaveBeenCalledWith(
      { userId: user.id },
      { where: { removedAt: null, userId: null, email: "ana@test.com" } },
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ accessToken: expect.any(String) }));
  });

  test("registerInvite 403 sin invitación pendiente", async () => {
    models.User.findOne.mockResolvedValue(null);
    models.EventMember.findAll.mockResolvedValue([]);
    const { res } = await callHandler(controller.registerInvite, {
      req: createMockReq({ body: { name: "Luis", email: "luis@test.com", password: "secret12" } }),
    });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(models.User.create).not.toHaveBeenCalled();
  });

  test("registerInvite 409 si el correo ya tiene cuenta", async () => {
    models.User.findOne.mockResolvedValue(fakeUser({ email: "luis@test.com" }));
    const { res } = await callHandler(controller.registerInvite, {
      req: createMockReq({ body: { name: "Luis", email: "luis@test.com", password: "secret12" } }),
    });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(models.User.create).not.toHaveBeenCalled();
  });

  test("invitationStatus pending", async () => {
    models.User.findOne.mockResolvedValue(null);
    models.EventMember.findAll.mockResolvedValue([{ id: "m1" }]);
    const { res } = await callHandler(controller.invitationStatus, {
      req: createMockReq({ query: { email: "Luis@Test.com" } }),
    });
    expect(res.json).toHaveBeenCalledWith({ status: "pending" });
  });

  test("registerInvite 201 crea cuenta sin checkout", async () => {
    models.EventMember.findAll.mockResolvedValue([{ role: "Asistente", email: "luis@test.com", userId: null }]);
    models.User.findOne.mockResolvedValue(null);
    const user = fakeUser({ id: "usr_inv_1", email: "luis@test.com", planId: null });
    models.User.create.mockResolvedValue(user);

    const { res } = await callHandler(controller.registerInvite, {
      req: createMockReq({ body: { name: "Luis", email: "Luis@Test.com", password: "secret12" } }),
    });

    expect(models.User.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "luis@test.com", planId: null, subscriptionStatus: "active" }),
    );
    expect(models.EventMember.update).toHaveBeenCalledWith(
      { userId: "usr_inv_1" },
      { where: { removedAt: null, userId: null, email: "luis@test.com" } },
    );
    expect(startCheckout).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ checkoutUrl: null, accessToken: expect.any(String) }));
  });

  test("refresh 401 sin token", async () => {
    const { res } = await callHandler(controller.refresh, { req: createMockReq({ body: {}, cookies: {} }) });
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("logout limpia cookie", async () => {
    const { res } = await callHandler(controller.logout, { req: createMockReq({ cookies: {} }) });
    expect(res.clearCookie).toHaveBeenCalledWith("refreshToken", { path: "/" });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test("forgotPassword siempre 200", async () => {
    models.User.findOne.mockResolvedValue(null);
    const { res } = await callHandler(controller.forgotPassword, {
      req: createMockReq({ body: { email: "nobody@test.com" } }),
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  test("resetPassword 400 sin token", async () => {
    const { res } = await callHandler(controller.resetPassword, { req: createMockReq({ body: {} }) });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("me serializa sesión", async () => {
    const user = fakeUser();
    models.Plan.findByPk.mockResolvedValue(fakePlan());

    const { res } = await callHandler(controller.me, { req: createMockReq({ user }) });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ user: expect.objectContaining({ email: user.email }) }));
  });

  test("dashboard incluye estado", async () => {
    const user = fakeUser();
    models.Plan.findByPk.mockResolvedValue(fakePlan());

    const { res } = await callHandler(controller.dashboard, { req: createMockReq({ user }) });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ events: [], session: expect.any(Object) }));
  });
});