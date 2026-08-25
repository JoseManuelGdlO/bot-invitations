import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks, fakeUser } from "../helpers/controller.js";
import { createInstance } from "../helpers/models.js";

describe("cancellation.controller", () => {
  let controller;
  let models;
  let requestCancellation;
  let withdrawCancellation;
  let decideCancellation;

  beforeEach(async () => {
    requestCancellation = jest.fn(async () => createInstance({ id: "c1", status: "pending", reason: "motivo largo" }));
    withdrawCancellation = jest.fn();
    decideCancellation = jest.fn(async (row) => ({ ...row, status: "approved" }));
    ({ mod: controller, models } = await loadWithMocks("src/controllers/cancellation.controller.js", {
      extraMocks: {
        "src/services/cancellation.service.js": () => ({
          decideCancellation,
          getLatestCancellation: jest.fn(async () => null),
          requestCancellation,
          serializeCancellation: (row) => ({ id: row.id, status: row.status, reason: row.reason }),
          withdrawCancellation,
        }),
      },
    }));
  });

  test("getMine sin solicitud", async () => {
    const { res } = await callHandler(controller.getMine);
    expect(res.json).toHaveBeenCalledWith({ cancellation: null });
  });

  test("createMine 201", async () => {
    const { res } = await callHandler(controller.createMine, {
      req: createMockReq({ user: fakeUser(), body: { reason: "Ya no usaré la plataforma este año" } }),
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("createMine propaga error de validación por next", async () => {
    const err = Object.assign(new Error("motivo"), { status: 400 });
    requestCancellation.mockRejectedValue(err);
    const { next, res } = await callHandler(controller.createMine, {
      req: createMockReq({ body: { reason: "x" } }),
    });
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
    expect(next.mock.calls[0][0].status).toBe(400);
  });

  test("approve 404", async () => {
    models.CancellationRequest.findByPk.mockResolvedValue(null);
    const { res } = await callHandler(controller.approve, {
      req: createMockReq({ params: { requestId: "x" }, body: { note: "ok" } }),
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("unread pending", async () => {
    models.CancellationRequest.count.mockResolvedValue(2);
    const { res } = await callHandler(controller.unread);
    expect(res.json).toHaveBeenCalledWith({ count: 2 });
  });
});
