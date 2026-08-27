import { jest } from "@jest/globals";

await jest.unstable_mockModule("../../src/config/env.js", () => ({
  env: {
    wc: {
      apiUrl: "https://wc.example.test",
      serviceJwt: "test-wc-service-jwt",
      timeoutMs: 8000,
    },
  },
}));

const { wcClient } = await import("../../src/services/wc.client.js");

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body ?? {}),
  };
}

describe("wc.client device ownership", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("acepta un device listado con tenantId coincidente", async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse(200, {
        devices: [{ id: "dev_own", tenantId: "ten_a" }],
      }),
    );

    await expect(
      wcClient.assertDeviceOwnedByTenant({ deviceId: "dev_own", tenantId: "ten_a" }),
    ).resolves.toEqual({ deviceId: "dev_own", tenantId: "ten_a" });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://wc.example.test/tenants/ten_a/devices");
    expect(init.headers["x-tenant-id"]).toBe("ten_a");
  });

  test("rechaza un device visible por JWT admin sin tenant en la lista", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(200, { devices: [{ id: "dev_foreign" }] }));

    await expect(
      wcClient.assertDeviceOwnedByTenant({ deviceId: "dev_foreign", tenantId: "ten_a" }),
    ).rejects.toMatchObject({
      status: 403,
      message: "WhatsApp Connect no confirmó la titularidad del device para este tenant.",
    });
  });

  test("rechaza un device de otro tenant aunque el JWT de servicio pueda listarlo", async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse(200, { devices: [{ id: "dev_b", tenantId: "ten_b" }] }),
    );

    await expect(
      wcClient.assertDeviceOwnedByTenant({ deviceId: "dev_b", tenantId: "ten_a" }),
    ).rejects.toMatchObject({ status: 403 });
  });

  test("si no hay listado de tenant, exige tenantId en GET /devices/:id", async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse(404, { message: "not found" }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "dev_own", tenantId: "ten_a" }));

    await expect(
      wcClient.assertDeviceOwnedByTenant({ deviceId: "dev_own", tenantId: "ten_a" }),
    ).resolves.toEqual({ deviceId: "dev_own", tenantId: "ten_a" });

    expect(fetch.mock.calls[1][0]).toBe("https://wc.example.test/devices/dev_own");
    expect(fetch.mock.calls[1][1].headers["x-tenant-id"]).toBe("ten_a");
  });

  test("no acepta GET de device sin tenantId aunque el JWT admin responda 200", async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse(404, {}))
      .mockResolvedValueOnce(jsonResponse(200, { id: "dev_own", status: "ONLINE" }));

    await expect(
      wcClient.assertDeviceOwnedByTenant({ deviceId: "dev_own", tenantId: "ten_a" }),
    ).rejects.toMatchObject({
      status: 403,
      message: "WhatsApp Connect no confirmó la titularidad del device para este tenant.",
    });
  });

  test("sendMessage exige tenantId y lo envía en header y body", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(200, { id: "msg_1" }));

    await wcClient.sendMessage({
      deviceId: "dev_own",
      to: "5215550000000",
      text: "hola",
      tenantId: "ten_a",
    });

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://wc.example.test/devices/dev_own/messages/send");
    expect(init.headers["x-tenant-id"]).toBe("ten_a");
    expect(JSON.parse(init.body)).toMatchObject({ tenantId: "ten_a", text: "hola" });
  });

  test("sendMessage rechaza envíos sin tenantId", async () => {
    await expect(
      wcClient.sendMessage({ deviceId: "dev_own", to: "5215550000000", text: "hola" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });
});
