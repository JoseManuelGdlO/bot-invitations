import { loadWithMocks, fakePlan, fakeUser } from "../helpers/loadWithMocks.js";

describe("plans.service", () => {
  let service;
  let models;

  beforeEach(async () => {
    ({ mod: service, models } = await loadWithMocks("src/services/plans.service.js"));
  });

  test("yearlyPriceMxn aplica el descuento anual", () => {
    expect(service.yearlyPriceMxn({ priceMxn: 1000, annualDiscountPercent: 20 })).toBe(9600);
  });

  test("serializePlan incluye yearlyPriceMxn", () => {
    const json = service.serializePlan(fakePlan());
    expect(json.yearlyPriceMxn).toBe(11520);
    expect(json.slug).toBe("estudio");
  });

  test("isSubscriptionUsable es false si la cuenta está cancelada", () => {
    expect(service.isSubscriptionUsable(fakeUser({ subscriptionStatus: "canceled" }))).toBe(false);
    expect(service.isSubscriptionUsable(fakeUser({ isAdmin: true, subscriptionStatus: "canceled" }))).toBe(true);
  });

  test("assertCanSendInvitations lanza 402 si la suscripción no es usable", () => {
    expect(() => service.assertCanSendInvitations(fakeUser({ subscriptionStatus: "pending" }))).toThrow(
      expect.objectContaining({
        status: 402,
        upgrade: true,
        message: "Tu suscripción no está activa. Paga tu plan para enviar mensajes de WhatsApp.",
      }),
    );
  });

  test("assertCanSendInvitations pasa con plan activo o admin", () => {
    expect(service.assertCanSendInvitations(fakeUser({ subscriptionStatus: "active" }))).toBeUndefined();
    expect(
      service.assertCanSendInvitations(fakeUser({ isAdmin: true, subscriptionStatus: "canceled" })),
    ).toBeUndefined();
  });

  test("assertCanConnectWhatsapp lanza 402 si no hay plan activo", () => {
    expect(() => service.assertCanConnectWhatsapp(fakeUser({ subscriptionStatus: "canceled" }))).toThrow(
      expect.objectContaining({
        status: 402,
        message: "Necesitas un plan activo para conectar WhatsApp.",
      }),
    );
  });

  test("assertCanSendInvitationsForEvent usa el plan del dueño", async () => {
    const owner = fakeUser({ id: "usr_owner", subscriptionStatus: "pending" });
    const member = fakeUser({ id: "usr_member", subscriptionStatus: "active" });
    models.User.findByPk.mockResolvedValue(owner);
    await expect(
      service.assertCanSendInvitationsForEvent(member, { ownerId: "usr_owner" }),
    ).rejects.toMatchObject({ status: 402 });
    expect(models.User.findByPk).toHaveBeenCalledWith("usr_owner");
  });

  test("assertCanSendInvitationsForEvent no pega a User si el actor es el dueño", async () => {
    const owner = fakeUser({ id: "usr_owner", subscriptionStatus: "active" });
    await expect(
      service.assertCanSendInvitationsForEvent(owner, { ownerId: "usr_owner" }),
    ).resolves.toBeUndefined();
    expect(models.User.findByPk).not.toHaveBeenCalled();
  });

  test("getPlanUsage.canSendInvitations refleja la suscripción", async () => {
    models.Plan.findByPk.mockResolvedValue(fakePlan());
    models.Event.count.mockResolvedValue(0);
    models.Event.findAll.mockResolvedValue([]);
    const usage = await service.getPlanUsage(fakeUser({ subscriptionStatus: "canceled" }));
    expect(usage.canSendInvitations).toBe(false);
  });

  test("planError usa status 402", () => {
    const err = service.planError("mejora tu plan");
    expect(err.status).toBe(402);
    expect(err.upgrade).toBe(true);
  });

  test("assertCanCreateEvent lanza 402 al llegar al límite", async () => {
    models.Plan.findByPk.mockResolvedValue(fakePlan({ eventLimit: 1 }));
    models.Event.count.mockResolvedValue(1);
    await expect(service.assertCanCreateEvent(fakeUser())).rejects.toMatchObject({ status: 402 });
  });

  test("assertCanAddGuests lanza 402 si no hay cupo", async () => {
    models.Plan.findByPk.mockResolvedValue(fakePlan({ guestLimit: 10 }));
    models.Event.findAll.mockResolvedValue([{ id: "evt_1" }]);
    models.Guest.sum.mockResolvedValue(9);
    await expect(service.assertCanAddGuests(fakeUser(), 2)).rejects.toMatchObject({ status: 402 });
  });

  test("assertCanAddGuestsForEvent usa el plan del dueño", async () => {
    const owner = fakeUser({ id: "usr_owner", planId: "plan_1" });
    const member = fakeUser({ id: "usr_member", planId: null });
    models.User.findByPk.mockResolvedValue(owner);
    models.Plan.findByPk.mockResolvedValue(fakePlan({ guestLimit: 100 }));
    models.Event.findAll.mockResolvedValue([{ id: "evt_1" }]);
    models.Guest.sum.mockResolvedValue(2);
    await expect(
      service.assertCanAddGuestsForEvent(member, { ownerId: "usr_owner" }, 1),
    ).resolves.toBeUndefined();
    expect(models.User.findByPk).toHaveBeenCalledWith("usr_owner");
    expect(models.Plan.findByPk).toHaveBeenCalledWith("plan_1");
  });

  test("ensurePlans crea definiciones faltantes", async () => {
    models.Plan.findOne.mockResolvedValue(null);
    models.Plan.findAll.mockResolvedValue(service.PLAN_DEFS);
    await service.ensurePlans();
    expect(models.Plan.create).toHaveBeenCalledTimes(service.PLAN_DEFS.length);
  });
});
