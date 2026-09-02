import { jest } from "@jest/globals";

await jest.unstable_mockModule("../../src/config/env.js", () => ({
    env: {
      meta: {
        templateName: "alanna_cold",
        templateNameDocument: "constructor2",
        templateLanguage: "es_MX",
        graphVersion: "v21.0",
        timeoutMs: 8000,
        mediaTimeoutMs: 60000,
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
  test("conserva saltos de línea y convierte tabs en espacio", () => {
    expect(sanitizeMetaBodyParam("Hola\n\nmundo\t!")).toBe("Hola\n\nmundo !");
  });

  test("normaliza CRLF y colapsa espacios horizontales", () => {
    expect(sanitizeMetaBodyParam("Hola\r\n\r\nmundo  extra")).toBe("Hola\n\nmundo extra");
  });

  test("colapsa espacios y recorta", () => {
    expect(sanitizeMetaBodyParam("  hola   mundo  ")).toBe("hola mundo");
  });

  test("conserva markup WhatsApp", () => {
    expect(sanitizeMetaBodyParam("*Brenda & Denis*\n_cursiva_")).toBe("*Brenda & Denis*\n_cursiva_");
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
            { type: "text", text: "Hola\ninvitación" },
          ],
        },
      ],
    });
  });

  test("sendTemplate inyecta header document y usa constructor2", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(200, { messages: [{ id: "wamid.doc" }] }));
    await metaClient.sendTemplate({
      to: "6183218624",
      bodyParams: ["Luis", "Hola\ninvitación"],
      templateName: "constructor2",
      headerDocument: { id: "media_abc", filename: "invitacion.pdf" },
      ...auth,
    });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.template).toEqual({
      name: "constructor2",
      language: { code: "es_MX" },
      components: [
        {
          type: "header",
          parameters: [
            {
              type: "document",
              document: { id: "media_abc", filename: "invitacion.pdf" },
            },
          ],
        },
        {
          type: "body",
          parameters: [
            { type: "text", text: "Luis" },
            { type: "text", text: "Hola\ninvitación" },
          ],
        },
      ],
    });
  });

  test("sendTemplate 400 si la plantilla con documento no trae archivo", async () => {
    await expect(
      metaClient.sendTemplate({
        to: "6183218624",
        bodyParams: ["Luis", "copy"],
        templateName: "constructor2",
        ...auth,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "La plantilla con documento requiere un archivo adjunto.",
    });
    await expect(
      metaClient.sendTemplate({
        to: "6183218624",
        bodyParams: ["Luis", "copy"],
        headerDocument: { id: "  " },
        ...auth,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });

  test("uploadDocument POST a /media y devuelve id", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(200, { id: "media_abc" }));
    const id = await metaClient.uploadDocument({
      buffer: Buffer.from("%PDF-1.4"),
      filename: "inv.pdf",
      mime: "application/pdf",
      ...auth,
    });
    expect(id).toBe("media_abc");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v21.0/10987654321/media");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-graph-token");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get("type")).toBe("application/pdf");
    expect(init.body.get("messaging_product")).toBe("whatsapp");
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

  test("sendText adjunta code y details cuando Graph responde error", async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse(400, {
        error: {
          message: "(#131026) Message undeliverable",
          type: "OAuthException",
          code: 131026,
          error_data: { details: "Message Undeliverable." },
          fbtrace_id: "ABC123",
        },
      }),
    );
    await expect(metaClient.sendText({ to: "6183218624", text: "Hola", ...auth })).rejects.toMatchObject({
      status: 400,
      message: "(#131026) Message undeliverable",
      meta: expect.objectContaining({ code: 131026, details: "Message Undeliverable.", fbtraceId: "ABC123" }),
    });
  });
});
