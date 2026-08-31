import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks, fakePlan, fakeUser } from "../helpers/controller.js";

describe("admin.controller", () => {
  let controller;
  let models;

  beforeEach(async () => {
    ({ mod: controller, models } = await loadWithMocks("src/controllers/admin.controller.js", {
      extraMocks: {
        "src/services/stripe.service.js": () => ({
          stripeEnabled: () => false,
          ensureStripePrice: jest.fn(),
        }),
      },
    }));
  });

  test("ensureAdmin crea admin si no existe", async () => {
    models.User.findOne.mockResolvedValue(null);
    models.User.create.mockResolvedValue(fakeUser({ isAdmin: true, email: "admin@alannaconfirmaciones.com.mx" }));
    const user = await controller.ensureAdmin();
    expect(user.isAdmin).toBe(true);
  });

  test("overview", async () => {
    models.User.count.mockResolvedValue(2);
    models.Event.count.mockResolvedValue(1);
    models.Guest.count.mockResolvedValue(10);
    models.Plan.findAll.mockResolvedValue([fakePlan()]);
    models.User.findAll.mockResolvedValue([fakeUser()]);
    const { res } = await callHandler(controller.overview);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ clients: 2, events: 1 }));
  });

  test("updateClient 404 si es admin", async () => {
    models.User.findByPk.mockResolvedValue(fakeUser({ isAdmin: true }));
    const { res } = await callHandler(controller.updateClient, {
      req: createMockReq({ params: { userId: "usr_test_1" }, body: {} }),
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("updatePlan 404", async () => {
    models.Plan.findByPk.mockResolvedValue(null);
    const { res } = await callHandler(controller.updatePlan, {
      req: createMockReq({ params: { planId: "x" }, body: { name: "X" } }),
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("listPlans", async () => {
    models.Plan.findAll.mockResolvedValue([fakePlan()]);
    const { res } = await callHandler(controller.listPlans);
    expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ slug: "estudio" })]);
  });

  test("listClients sin search", async () => {
    models.User.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
    const { res } = await callHandler(controller.listClients, { req: createMockReq({ query: {} }) });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ items: [], total: 0, page: 1, limit: 20, totalPages: 1 }),
    );
  });
});
