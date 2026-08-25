import { jest } from "@jest/globals";
import { callHandler, loadWithMocks } from "../helpers/controller.js";

describe("finance.controller", () => {
  test("snapshot delega en getFinanceSnapshot", async () => {
    const { mod } = await loadWithMocks("src/controllers/finance.controller.js", {
      extraMocks: {
        "src/services/finance.service.js": () => ({
          getFinanceSnapshot: jest.fn(async () => ({ estimatedMrrMxn: 0 })),
        }),
      },
    });
    const { res } = await callHandler(mod.snapshot);
    expect(res.json).toHaveBeenCalledWith({ estimatedMrrMxn: 0 });
  });
});
