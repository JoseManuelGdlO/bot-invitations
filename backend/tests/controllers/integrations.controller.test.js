import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks, fakeUser } from "../helpers/controller.js";
import { encryptCredentialsPayload } from "../../src/utils/credentials-crypto.js";

function fakeIntegration(overrides = {}) {
  return {
    id: "int_1",
    ownerUserId: "usr_test_1",
    channel: "whatsapp",
    provider: "whatsapp-connect",
    displayName: "WhatsApp",
    status: "draft",
    webhookUrl: null,
    lastHealthcheckAt: null,
    lastError: null,
    update: jest.fn(async function update(patch) {
      Object.assign(this, patch);
      return this;
    }),
    ...overrides,
  };
}

describe("integrations.controller credentials", () => {
  let controller;
  let models;
  let assertDeviceOwnedByTenant;
  let findAllCredentials;

  beforeEach(async () => {
    assertDeviceOwnedByTenant = jest.fn(async () => ({ deviceId: "dev_own", tenantId: "ten_a" }));
    findAllCredentials = jest.fn(async () => []);

    ({ mod: controller, models } = await loadWithMocks("src/controllers/integrations.controller.js", {
      extraMocks: {
        "src/services/wc.client.js": () => ({
          wcClient: { assertDeviceOwnedByTenant },
          requireWcTenantId: (id) => String(id || "").trim(),
        }),
        "src/services/wc-auth.js": () => ({
          runWithWcToken: async (cb) => cb("token"),
          getWcToken: async () => "token",
        }),
      },
    }));

    models.ChannelCredential.findAll = findAllCredentials;
    models.ChannelCredential.findOne.mockResolvedValue(null);
    models.ChannelCredential.update.mockResolvedValue([1]);
    models.ChannelCredential.create.mockResolvedValue({ id: "cred_1" });
  });

  test("persiste credenciales si WC confirma titularidad", async () => {
    const row = fakeIntegration();
    models.ChannelIntegration.findOne.mockResolvedValue(row);

    const { res } = await callHandler(controller.postIntegrationCredentials, {
      req: createMockReq({
        user: fakeUser(),
        params: { id: row.id },
        body: {
          payload: { deviceId: "dev_own", webhookSecret: "sec", tenantId: "ten_a" },
        },
      }),
    });

    expect(assertDeviceOwnedByTenant).toHaveBeenCalledWith({ deviceId: "dev_own", tenantId: "ten_a" });
    expect(models.ChannelCredential.create).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("no persiste un device de otro tenant", async () => {
    const row = fakeIntegration();
    models.ChannelIntegration.findOne.mockResolvedValue(row);
    const err = Object.assign(new Error("Este device no pertenece al tenant de WhatsApp Connect indicado."), {
      status: 403,
    });
    assertDeviceOwnedByTenant.mockRejectedValue(err);

    const { res, next } = await callHandler(controller.postIntegrationCredentials, {
      req: createMockReq({
        user: fakeUser(),
        params: { id: row.id },
        body: { deviceId: "dev_foreign", webhookSecret: "sec", tenantId: "ten_a" },
      }),
    });

    expect(models.ChannelCredential.create).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });

  test("exige tenantId antes de hablar con WC", async () => {
    const row = fakeIntegration();
    models.ChannelIntegration.findOne.mockResolvedValue(row);

    const { next } = await callHandler(controller.postIntegrationCredentials, {
      req: createMockReq({
        user: fakeUser(),
        params: { id: row.id },
        body: { deviceId: "dev_own", webhookSecret: "sec" },
      }),
    });

    expect(assertDeviceOwnedByTenant).not.toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toMatchObject({ status: 400 });
  });

  test("rechaza un device ya vinculado a otra cuenta", async () => {
    const row = fakeIntegration();
    models.ChannelIntegration.findOne.mockResolvedValue(row);
    findAllCredentials.mockResolvedValue([
      {
        ownerUserId: "usr_other",
        cipherText: encryptCredentialsPayload({
          deviceId: "dev_own",
          webhookSecret: "other",
          tenantId: "ten_b",
        }),
      },
    ]);

    const { next } = await callHandler(controller.postIntegrationCredentials, {
      req: createMockReq({
        user: fakeUser(),
        params: { id: row.id },
        body: { deviceId: "dev_own", webhookSecret: "sec", tenantId: "ten_a" },
      }),
    });

    expect(models.ChannelCredential.create).not.toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toMatchObject({ status: 409 });
  });
});
