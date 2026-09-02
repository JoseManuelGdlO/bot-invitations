import { jest } from "@jest/globals";

const metaEnv = {
  templateName: "alanna_cold",
  templateNameDocument: "constructor2",
  templateLanguage: "es_MX",
  graphVersion: "v21.0",
  timeoutMs: 8000,
  mediaTimeoutMs: 60000,
};

await jest.unstable_mockModule("../../src/config/env.js", () => ({
    env: { meta: metaEnv },
}));

const { metaClient, sanitizeMetaBodyParam, parseMessageTemplate, extractTemplateParameters, fillMetaTemplate, clearMessageTemplateCache } = await import("../../src/services/meta.client.js");

const auth = { accessToken: "test-graph-token", phoneNumberId: "10987654321" };

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body ?? {}),
  };
}

describe("sanitizeMetaBodyParam", () => {
  test("aplana saltos de línea y tabs; Meta no los admite en variables HSM", () => {
    expect(sanitizeMetaBodyParam("Hola\n\nmundo\t!")).toBe("Hola mundo !");
  });

  test("interpreta \\n literales y colapsa espacios", () => {
    expect(sanitizeMetaBodyParam("Hola\\n\\nmundo  extra")).toBe("Hola mundo extra");
  });

  test("normaliza CRLF a espacio", () => {
    expect(sanitizeMetaBodyParam("Hola\r\n\r\nmundo  extra")).toBe("Hola mundo extra");
  });

  test("colapsa espacios y recorta", () => {
    expect(sanitizeMetaBodyParam("  hola   mundo  ")).toBe("hola mundo");
  });

  test("conserva markup WhatsApp y aplana el salto", () => {
    expect(sanitizeMetaBodyParam("*Brenda & Denis*\n_cursiva_")).toBe("*Brenda & Denis* _cursiva_");
  });
});

describe("meta.client", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    metaEnv.templateNameDocument = "constructor2";
    clearMessageTemplateCache();
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
            { type: "text", text: "Hola invitación" },
          ],
        },
      ],
    });
  });

  test("sendTemplate con documento ignora constructor2 del job y usa META_TEMPLATE_NAME_DOCUMENT", async () => {
    metaEnv.templateNameDocument = "rg_eventos";
    fetch.mockResolvedValueOnce(jsonResponse(200, { messages: [{ id: "wamid.doc" }] }));
    await metaClient.sendTemplate({
      to: "6183218624",
      bodyParams: ["Luis", "Hola invitación"],
      templateName: "constructor2",
      headerDocument: { id: "media_abc", filename: "invitacion.pdf" },
      ...auth,
    });
    expect(JSON.parse(fetch.mock.calls[0][1].body).template.name).toBe("rg_eventos");
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

  test("uploadDocument 400 si el archivo no existe", async () => {
    await expect(
      metaClient.uploadDocument({
        filePath: "/no/existe/inv.pdf",
        filename: "inv.pdf",
        mime: "application/pdf",
        ...auth,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Activa el adjunto pero falta el documento.",
    });
    expect(fetch).not.toHaveBeenCalled();
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

describe("parseMessageTemplate", () => {
  test("extrae BODY, FOOTER y placeholders posicionales", () => {
    const parsed = parseMessageTemplate({
      name: "alanna_cold",
      language: "es_MX",
      status: "APPROVED",
      parameter_format: "POSITIONAL",
      components: [
        { type: "BODY", text: "¡Hola, buen día! {{1}}\nNos comunicamos de {{2}}" },
        { type: "FOOTER", text: "Muchas gracias." },
      ],
    });
    expect(parsed).toEqual({
      id: null,
      name: "alanna_cold",
      language: "es_MX",
      status: "APPROVED",
      parameterFormat: "positional",
      header: null,
      body: {
        text: "¡Hola, buen día! {{1}}\nNos comunicamos de {{2}}",
        parameters: [{ key: "1" }, { key: "2" }],
      },
      footer: { text: "Muchas gracias." },
    });
  });

  test("detecta HEADER DOCUMENT y variables named", () => {
    const parsed = parseMessageTemplate({
      name: "rg_eventos",
      language: "es_MX",
      status: "APPROVED",
      components: [
        { type: "HEADER", format: "DOCUMENT" },
        { type: "BODY", text: "Hola {{first_name}}, te invitamos a {{evento}}" },
      ],
    });
    expect(parsed.header).toEqual({ format: "DOCUMENT", text: null });
    expect(extractTemplateParameters(parsed.body.text)).toEqual([
      { key: "first_name" },
      { key: "evento" },
    ]);
  });

  test("fillMetaTemplate sustituye por índice", () => {
    expect(fillMetaTemplate("Hola {{1}}, de {{2}}", ["Luis", "RG Eventos"])).toBe(
      "Hola Luis, de RG Eventos",
    );
  });
});

describe("meta.client getMessageTemplate", () => {
  const wabaAuth = { accessToken: "test-graph-token", wabaId: "waba_1" };

  beforeEach(() => {
    global.fetch = jest.fn();
    metaEnv.templateNameDocument = "constructor2";
    clearMessageTemplateCache();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("GET message_templates y parsea BODY/FOOTER", async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse(200, {
        data: [
          {
            name: "alanna_cold",
            language: "es_MX",
            status: "APPROVED",
            components: [
              { type: "BODY", text: "¡Hola {{1}}! {{2}}" },
              { type: "FOOTER", text: "Gracias" },
            ],
          },
        ],
      }),
    );
    const parsed = await metaClient.getMessageTemplate(wabaAuth);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain("https://graph.facebook.com/v21.0/waba_1/message_templates?");
    expect(url).toContain("name=alanna_cold");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer test-graph-token");
    expect(parsed.body.parameters).toEqual([{ key: "1" }, { key: "2" }]);
    expect(parsed.footer).toEqual({ text: "Gracias" });
  });

  test("usa cache en el segundo GET", async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse(200, {
        data: [
          {
            name: "alanna_cold",
            language: "es_MX",
            status: "APPROVED",
            components: [{ type: "BODY", text: "Hola {{1}}" }],
          },
        ],
      }),
    );
    await metaClient.getMessageTemplate(wabaAuth);
    await metaClient.getMessageTemplate(wabaAuth);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("document=true usa META_TEMPLATE_NAME_DOCUMENT", async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse(200, {
        data: [
          {
            name: "constructor2",
            language: "es_MX",
            status: "APPROVED",
            components: [{ type: "HEADER", format: "DOCUMENT" }, { type: "BODY", text: "Doc {{1}}" }],
          },
        ],
      }),
    );
    const parsed = await metaClient.getMessageTemplate({ ...wabaAuth, document: true });
    expect(fetch.mock.calls[0][0]).toContain("name=constructor2");
    expect(parsed.header.format).toBe("DOCUMENT");
  });

  test("403 pide permiso whatsapp_business_management", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(403, { error: { message: "forbidden", code: 200 } }));
    await expect(metaClient.getMessageTemplate(wabaAuth)).rejects.toMatchObject({
      status: 403,
      message: "No hay permiso para leer plantillas de Meta (whatsapp_business_management).",
    });
  });

  test("404 si Graph no trae la plantilla", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(200, { data: [] }));
    await expect(metaClient.getMessageTemplate(wabaAuth)).rejects.toMatchObject({
      status: 404,
      message: "No se encontró la plantilla de Meta.",
    });
  });

  test("400 si faltan credenciales", async () => {
    await expect(metaClient.getMessageTemplate({})).rejects.toMatchObject({ status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });
});
