import {
  recordTestDeliveryStatus,
  resetTestDeliveryWaiters,
  waitForTestDelivery,
} from "../../src/services/whatsapp-test-delivery.js";

describe("whatsapp-test-delivery", () => {
  beforeEach(() => {
    resetTestDeliveryWaiters();
  });

  afterEach(() => {
    resetTestDeliveryWaiters();
  });

  test("espera el status si el webhook llega después", async () => {
    const pending = waitForTestDelivery("wamid.later", 500);
    recordTestDeliveryStatus({
      messageId: "wamid.later",
      status: "failed",
      errors: [{ code: 131047, title: "Re-engagement message" }],
    });
    await expect(pending).resolves.toMatchObject({
      messageId: "wamid.later",
      status: "failed",
    });
  });

  test("devuelve el status cacheado si el webhook llega antes", async () => {
    recordTestDeliveryStatus({ messageId: "wamid.early", status: "failed" });
    await expect(waitForTestDelivery("wamid.early", 500)).resolves.toMatchObject({
      messageId: "wamid.early",
      status: "failed",
    });
  });

  test("timeout sin webhook devuelve null", async () => {
    await expect(waitForTestDelivery("wamid.missing", 20)).resolves.toBeNull();
  });
});
