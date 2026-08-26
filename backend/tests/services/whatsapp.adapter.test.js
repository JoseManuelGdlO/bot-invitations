import { jest } from "@jest/globals";
import { loadWithMocks, fakeEvent } from "../helpers/loadWithMocks.js";

describe("whatsapp.adapter", () => {
  let adapter;
  let models;
  let sendMessageWithRetry;
  let resolveActiveWhatsappConnectByOwner;

  beforeEach(async () => {
    sendMessageWithRetry = jest.fn(async () => ({ id: "wamid_1" }));
    resolveActiveWhatsappConnectByOwner = jest.fn(async () => ({
      credentials: { deviceId: "dev_1", tenantId: "tenant_1" },
    }));
    ({ mod: adapter, models } = await loadWithMocks("src/services/whatsapp.adapter.js", {
      extraMocks: {
        "src/services/wc.client.js": () => ({
          wcClient: { sendMessageWithRetry },
        }),
        "src/services/wc-auth.js": () => ({
          runWithWcToken: jest.fn(async (cb) => cb("token")),
        }),
        "src/services/integration-resolver.service.js": () => ({
          resolveActiveWhatsappConnectByOwner,
        }),
      },
    }));
  });

  test("el provider actual es WhatsApp Connect", () => {
    const provider = adapter.createWhatsAppProvider();
    expect(provider).toBeInstanceOf(adapter.WhatsAppConnectProvider);
  });

  test("sendMessage 400 sin eventId", async () => {
    const provider = adapter.createWhatsAppProvider();
    await expect(provider.sendMessage("5511111111", "Hola")).rejects.toMatchObject({
      status: 400,
    });
    expect(sendMessageWithRetry).not.toHaveBeenCalled();
  });

  test("sendMessage 400 si el evento no existe", async () => {
    models.Event.findByPk.mockResolvedValue(null);
    const provider = adapter.createWhatsAppProvider();
    await expect(provider.sendMessage("5511111111", "Hola", { eventId: "evt_missing" })).rejects.toMatchObject({
      status: 400,
    });
  });

  test("sendMessage llama a WhatsApp Connect y no marca skipped", async () => {
    models.Event.findByPk.mockResolvedValue(fakeEvent());
    const provider = adapter.createWhatsAppProvider();
    const result = await provider.sendMessage("5215511111111", "Hola", { eventId: "evt_1" });
    expect(resolveActiveWhatsappConnectByOwner).toHaveBeenCalledWith({ ownerUserId: "usr_test_1" });
    expect(sendMessageWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: "dev_1",
        to: "5215511111111",
        type: "text",
        text: "Hola",
        tenantId: "tenant_1",
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        provider: "whatsapp-connect",
        providerId: "wamid_1",
        skipped: false,
      }),
    );
  });
});
