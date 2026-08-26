import { jest } from "@jest/globals";
import { hashToken, signAccessToken, signRefreshToken, verifyAccess } from "../../src/utils/tokens.js";
import { callHandler, createMockReq, loadWithMocks, fakePlan, fakeUser } from "../helpers/controller.js";

describe("auth refresh rotation", () => {
  let controller;
  let models;

  beforeEach(async () => {
    ({ mod: controller, models } = await loadWithMocks("src/controllers/auth.controller.js", {
      extraMocks: {
        "src/services/email.service.js": () => ({
          sendPasswordResetEmail: jest.fn(),
          sendTeamInvitationEmail: jest.fn(),
        }),
        "src/services/stripe.service.js": () => ({
          stripeEnabled: () => false,
          startCheckout: jest.fn(),
          scheduleCancelAtPeriodEnd: jest.fn(),
          createPortalSession: jest.fn(),
          syncStripePlans: jest.fn(),
          handleStripeEvent: jest.fn(),
          getStripe: jest.fn(),
        }),
        "src/services/state.service.js": () => ({ loadUserState: jest.fn(async () => ({ events: [] })) }),
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
    models.RefreshToken.create.mockImplementation(async (data) => data);
    models.Plan.findByPk.mockResolvedValue(fakePlan());
  });

  test("refresh rota el jti y conserva la family", async () => {
    const user = fakeUser();
    const familyId = "11111111-1111-4111-8111-111111111111";
    const raw = signRefreshToken(user, 7, { jti: "old_jti_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", familyId });
    const row = {
      userId: user.id,
      familyId,
      jti: "old_jti_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      expiresAt: new Date(Date.now() + 7 * 86400000),
      revokedAt: null,
      update: jest.fn(async function update(patch) {
        Object.assign(this, patch);
        return this;
      }),
    };
    models.RefreshToken.findOne.mockResolvedValue(row);
    models.User.findByPk.mockResolvedValue(user);

    const { res } = await callHandler(controller.refresh, {
      req: createMockReq({ body: {}, cookies: { refreshToken: raw } }),
    });

    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ revokedAt: expect.any(Date) }));
    expect(models.RefreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id, familyId, jti: expect.any(String) }),
    );
    const created = models.RefreshToken.create.mock.calls[0][0];
    expect(created.jti).not.toBe("old_jti_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(created.tokenHash).not.toBe(hashToken(raw));
    expect(res.cookie).toHaveBeenCalledWith("refreshToken", expect.any(String), expect.objectContaining({ httpOnly: true }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ accessToken: expect.any(String) }));
  });

  test("reuse de un refresh revocado invalida la family", async () => {
    const user = fakeUser({ tokenVersion: 0 });
    const familyId = "22222222-2222-4222-8222-222222222222";
    const raw = signRefreshToken(user, 7, { jti: "reused_jti_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", familyId });
    models.RefreshToken.findOne.mockResolvedValue({
      userId: user.id,
      familyId,
      jti: "reused_jti_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      expiresAt: new Date(Date.now() + 7 * 86400000),
      revokedAt: new Date(),
    });
    models.User.findByPk.mockResolvedValue(user);

    const { res } = await callHandler(controller.refresh, {
      req: createMockReq({ cookies: { refreshToken: raw } }),
    });

    expect(models.RefreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ revokedAt: expect.any(Date) }),
      expect.objectContaining({ where: expect.objectContaining({ familyId }) }),
    );
    expect(user.tokenVersion).toBe(1);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(models.RefreshToken.create).not.toHaveBeenCalled();
  });
});

describe("requireAuth tokenVersion", () => {
  test("401 si el access tiene ver anterior al logout", async () => {
    const user = fakeUser({ tokenVersion: 1 });
    const stale = signAccessToken({ ...user, tokenVersion: 0 });
    const { loadWithMocks: load } = await import("../helpers/loadWithMocks.js");
    const { mod, models } = await load("src/middleware/auth.js");
    models.User.findByPk.mockResolvedValue(user);
    const req = createMockReq({ headers: { authorization: `Bearer ${stale}` }, user: null });
    const res = {
      status: jest.fn(function status() {
        return this;
      }),
      json: jest.fn(function json() {
        return this;
      }),
    };
    const next = jest.fn();
    await mod.requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("pasa si ver coincide", async () => {
    const user = fakeUser({ tokenVersion: 2 });
    const token = signAccessToken(user);
    expect(verifyAccess(token).ver).toBe(2);
    const { loadWithMocks: load } = await import("../helpers/loadWithMocks.js");
    const { mod, models } = await load("src/middleware/auth.js");
    models.User.findByPk.mockResolvedValue(user);
    const req = createMockReq({ headers: { authorization: `Bearer ${token}` }, user: null });
    const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
    const next = jest.fn();
    await mod.requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBe(user);
  });
});
