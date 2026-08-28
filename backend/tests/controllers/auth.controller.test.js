import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks, fakePlan, fakeUser } from "../helpers/controller.js";

describe("auth.controller", () => {
  let controller;
  let models;
  let startCheckout;
  let scheduleCancelAtPeriodEnd;
  let sendPasswordResetEmail;

  beforeEach(async () => {
    startCheckout = jest.fn(async () => ({ checkoutUrl: "https://checkout.test", updated: false }));
    scheduleCancelAtPeriodEnd = jest.fn(async () => ({ scheduled: true, periodEnd: new Date() }));
    sendPasswordResetEmail = jest.fn(async () => ({ messageId: "mail_1" }));

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
        "src/services/email.service.js": () => ({
          sendPasswordResetEmail,
          sendTeamInvitationEmail: jest.fn(),
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

  test("register 409 si el correo ya está registrado", async () => {
    const plan = fakePlan({ id: "plan_1" });
    models.Plan.findByPk.mockResolvedValue(plan);
    models.User.findOne.mockResolvedValue(fakeUser({ email: "ana@test.com" }));

    const { res } = await callHandler(controller.register, {
      req: createMockReq({
        body: {
          name: "Ana",
          email: "Ana@Test.com",
          password: "secret12",
          planId: "plan_1",
          phone: "5511111111",
          state: "CDMX",
          businessName: "Studio Ana",
        },
      }),
    });

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: "Ese correo ya está registrado." });
    expect(models.User.create).not.toHaveBeenCalled();
  });

  test("emailAvailable 409 si el correo ya existe", async () => {
    models.User.findOne.mockResolvedValue(fakeUser({ email: "ana@test.com" }));
    const { res } = await callHandler(controller.emailAvailable, {
      req: createMockReq({ query: { email: "Ana@Test.com" } }),
    });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: "Ese correo ya está registrado." });
  });

  test("emailAvailable confirma correo libre", async () => {
    models.User.findOne.mockResolvedValue(null);
    const { res } = await callHandler(controller.emailAvailable, {
      req: createMockReq({ query: { email: "nueva@test.com" } }),
    });
    expect(res.json).toHaveBeenCalledWith({ available: true });
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

  test("logout con Bearer sube tokenVersion", async () => {
    const user = fakeUser({ tokenVersion: 0 });
    models.User.findByPk.mockResolvedValue(user);
    const { signAccessToken } = await import("../../src/utils/tokens.js");
    const access = signAccessToken(user);
    const { res } = await callHandler(controller.logout, {
      req: createMockReq({
        cookies: {},
        headers: { authorization: `Bearer ${access}` },
      }),
    });
    expect(user.tokenVersion).toBe(1);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test("logout limpia cookie con los mismos flags", async () => {
    const { res } = await callHandler(controller.logout, { req: createMockReq({ cookies: {}, headers: {} }) });
    expect(res.clearCookie).toHaveBeenCalledWith(
      "refreshToken",
      expect.objectContaining({ path: "/", httpOnly: true, sameSite: "lax" }),
    );
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test("forgotPassword siempre 200 sin enviar si el correo no existe", async () => {
    models.User.findOne.mockResolvedValue(null);
    const { res } = await callHandler(controller.forgotPassword, {
      req: createMockReq({ body: { email: "nobody@test.com" } }),
    });
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  test("forgotPassword envía correo y no loguea el token", async () => {
    const user = fakeUser({ email: "ana@test.com" });
    models.User.findOne.mockResolvedValue(user);
    const logs = [];
    const spy = jest.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.map(String).join(" "));
    });
    const { res } = await callHandler(controller.forgotPassword, {
      req: createMockReq({ body: { email: "ana@test.com" } }),
    });
    spy.mockRestore();
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ana@test.com",
        name: user.name,
        resetLink: expect.stringContaining("token="),
      }),
    );
    expect(logs.join("\n")).not.toMatch(/token=/);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  test("resetPassword 400 sin token", async () => {
    const { res } = await callHandler(controller.resetPassword, { req: createMockReq({ body: {} }) });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("resetPassword 400 si el enlace expiró", async () => {
    models.PasswordReset.findOne.mockResolvedValue({
      userId: "usr_test_1",
      expiresAt: new Date(Date.now() - 1000),
      usedAt: null,
      save: jest.fn(),
    });
    const { res } = await callHandler(controller.resetPassword, {
      req: createMockReq({ body: { token: "deadbeef", password: "nueva123" } }),
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "El enlace ya no es válido." }));
  });

  test("resetPassword actualiza el hash y marca el token usado", async () => {
    const row = {
      userId: "usr_test_1",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      usedAt: null,
      save: jest.fn(async function save() {
        return this;
      }),
    };
    const user = fakeUser();
    models.PasswordReset.findOne.mockResolvedValue(row);
    models.User.findByPk.mockResolvedValue(user);

    const { res } = await callHandler(controller.resetPassword, {
      req: createMockReq({ body: { token: "alivebeef", password: "nueva123" } }),
    });

    expect(user.passwordHash).toBe("hashed_password");
    expect(user.save).toHaveBeenCalled();
    expect(row.usedAt).toBeInstanceOf(Date);
    expect(row.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test("resetPassword 400 si el token ya se usó", async () => {
    models.PasswordReset.findOne.mockResolvedValue(null);
    const { res } = await callHandler(controller.resetPassword, {
      req: createMockReq({ body: { token: "used", password: "nueva123" } }),
    });
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