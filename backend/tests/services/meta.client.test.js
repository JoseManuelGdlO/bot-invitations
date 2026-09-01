import { jest } from "@jest/globals";

await jest.unstable_mockModule("../../src/config/env.js", () => ({
  env: {
    meta: {
      templateName: "alanna_cold",
      templateLanguage: "es_MX",
      graphVersion: "v21.0",
      timeoutMs: 8000,
    },
  },
}));

const { metaClient, sanitizeMetaBodyParam } = await import("../../src/services/meta.client.js");

const auth = { accessToken: "test-graph-token", phoneNumberId: "10987654321" };

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

  test("sendText usa to con lada 521 y Bearer del caller", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(200, { messages: [{ id: "wamid.1" }] }));
    await metaClient.sendText({ to: "6183218624", text: "Hola", ...auth });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v21.0/10987654321/messages");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-graph-token");
    expect(JSON.parse(init.body)).toEqual({
      messaging_product: "whatsapp",
      to: "5216183218624",
      type: "text",
      text: { body: "Hola" },
    });
  });

  test("sendText no duplica 521 si ya viene internacional", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(200, { messages: [{ id: "wamid.1" }] }));
    await metaClient.sendText({ to: "5216183218624", text: "Hola", ...auth });
    expect(JSON.parse(fetch.mock.calls[0][1].body).to).toBe("5216183218624");
  });

  test("sendTemplate inyecta {{1}} y {{2}} sanitizado", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(200, { messages: [{ id: "wamid.2" }] }));
    await metaClient.sendTemplate({
      to: "6183218624",
      bodyParams: ["Luis", "Hola\ninvitación"],
      ...auth,
    });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.type).toBe("template");
    expect(body.to).toBe("5216183218624");
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

  test("sendText 400 si el teléfono no tiene 10 dígitos locales", async () => {
    await expect(metaClient.sendText({ to: "abc", text: "Hola", ...auth })).rejects.toMatchObject({
      status: 400,
    });
    await expect(metaClient.sendText({ to: "55", text: "Hola", ...auth })).rejects.toMatchObject({
      status: 400,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  test("sendText 400 si faltan credenciales", async () => {
    await expect(metaClient.sendText({ to: "5512345678", text: "Hola" })).rejects.toMatchObject({
      status: 400,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
