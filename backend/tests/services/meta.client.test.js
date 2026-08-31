import { jest } from "@jest/globals";

await jest.unstable_mockModule("../../src/config/env.js", () => ({
  env: {
    meta: {
      accessToken: "test-graph-token",
      phoneNumberId: "10987654321",
      templateName: "alanna_cold",
      templateLanguage: "es_MX",
      graphVersion: "v21.0",
      timeoutMs: 8000,
    },
  },
}));

const { metaClient, sanitizeMetaBodyParam } = await import("../../src/services/meta.client.js");

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body ?? {}),
  };
}

describe("sanitizeMetaBodyParam", () => {
  test("aplana saltos de línea y tabs", () => {
    expect(sanitizeMetaBodyParam("Hola\n\nmundo\t!")).toBe("Hola mundo !");
  });

  test("colapsa espacios y recorta", () => {
    expect(sanitizeMetaBodyParam("  hola   mundo  ")).toBe("hola mundo");
  });
});

describe("meta.client", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("sendText usa to de 10 dígitos y Bearer", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(200, { messages: [{ id: "wamid.1" }] }));
    await metaClient.sendText({ to: "5216183218624", text: "Hola" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v21.0/10987654321/messages");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-graph-token");
    expect(JSON.parse(init.body)).toEqual({
      messaging_product: "whatsapp",
      to: "6183218624",
      type: "text",
      text: { body: "Hola" },
    });
  });

  test("sendTemplate inyecta {{1}} y {{2}} sanitizado", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(200, { messages: [{ id: "wamid.2" }] }));
    await metaClient.sendTemplate({
      to: "6183218624",
      bodyParams: ["Luis", "Hola\ninvitación"],
    });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.type).toBe("template");
    expect(body.to).toBe("6183218624");
    expect(body.template).toEqual({
      name: "alanna_cold",
      language: { code: "es_MX" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "Luis" },
            { type: "text", text: "Hola invitación" },
          ],
        },
      ],
    });
  });

  test("sendText 400 si el teléfono no tiene dígitos", async () => {
    await expect(metaClient.sendText({ to: "abc", text: "Hola" })).rejects.toMatchObject({
      status: 400,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
