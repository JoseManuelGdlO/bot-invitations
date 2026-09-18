import { jest } from "@jest/globals";

describe("meta-graph.client", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("parseGraphErrorPayload conserva code, subcode y fbtrace", async () => {
    const { parseGraphErrorPayload } = await import("../../src/services/meta-graph.client.js");
    expect(
      parseGraphErrorPayload(
        {
          error: {
            message: "Invalid OAuth access token",
            code: 190,
            error_subcode: 463,
            fbtrace_id: "ABC123",
          },
        },
        401,
      ),
    ).toEqual({
      httpStatus: 401,
      code: 190,
      subcode: 463,
      message: "Invalid OAuth access token",
      fbtraceId: "ABC123",
    });
  });

  test("graphErrorFromResponse no expone el token y sí el código de Meta", async () => {
    const { graphErrorFromResponse } = await import("../../src/services/meta-graph.client.js");
    const err = graphErrorFromResponse(401, {
      error: { message: "token EAAJBSECRET", code: 190, fbtrace_id: "t1" },
    });
    expect(err.status).toBe(401);
    expect(err.meta.code).toBe(190);
    expect(err.meta.fbtraceId).toBe("t1");
    expect(err.message).toContain("token de WhatsApp");
    expect(err.message).not.toContain("EAAJBSECRET");
  });

  test("graphErrorFromResponse traduce 131047 a la ventana de 24 horas", async () => {
    const { graphErrorFromResponse } = await import("../../src/services/meta-graph.client.js");
    const err = graphErrorFromResponse(400, {
      error: { message: "Re-engagement message", code: 131047 },
    });
    expect(err.message).toBe("Han pasado más de 24 horas. Debes usar una plantilla aprobada.");
  });

  const DENSITY =
    "Esta plantilla tiene demasiadas variables en relación con su longitud. Reduce el número de variables o aumenta la longitud del mensaje.";
  const START = "Las variables no pueden ir al principio del mensaje.";
  const END = "Las variables no pueden ir al final del mensaje.";

  test("graphErrorFromResponse traduce too many variables al copy de densidad", async () => {
    const { graphErrorFromResponse } = await import("../../src/services/meta-graph.client.js");
    const err = graphErrorFromResponse(400, {
      error: {
        message: "Param text cannot have too many variables relative to length",
        code: 100,
      },
    });
    expect(err.message).toBe(DENSITY);
    expect(err.meta.message).toContain("too many variables");
  });

  test("graphErrorFromResponse traduce too many variable parameters al copy de densidad", async () => {
    const { graphErrorFromResponse } = await import("../../src/services/meta-graph.client.js");
    const err = graphErrorFromResponse(400, {
      error: {
        message: "Param body cannot have too many variable parameters",
        code: 100,
      },
    });
    expect(err.message).toBe(DENSITY);
  });

  test("graphErrorFromResponse traduce cannot be at the start or end a inicio y fin", async () => {
    const { graphErrorFromResponse } = await import("../../src/services/meta-graph.client.js");
    const err = graphErrorFromResponse(400, {
      error: {
        message: "Variables cannot be at the start or end of the message",
        code: 100,
      },
    });
    expect(err.message).toBe(`${START} ${END}`);
  });

  test("graphErrorFromResponse traduce cannot be at the start al copy de inicio", async () => {
    const { graphErrorFromResponse } = await import("../../src/services/meta-graph.client.js");
    const err = graphErrorFromResponse(400, {
      error: { message: "A variable cannot be at the start of the template body", code: 132000 },
    });
    expect(err.message).toBe(START);
  });

  test("graphErrorFromResponse traduce cannot be at the end al copy de fin", async () => {
    const { graphErrorFromResponse } = await import("../../src/services/meta-graph.client.js");
    const err = graphErrorFromResponse(400, {
      error: { message: "A variable cannot be at the end of the template body", code: 132000 },
    });
    expect(err.message).toBe(END);
  });

  test("graphErrorFromResponse concatena densidad e inicio/fin si el texto trae ambos", async () => {
    const { graphErrorFromResponse } = await import("../../src/services/meta-graph.client.js");
    const err = graphErrorFromResponse(400, {
      error: {
        message:
          "The template has too many variables and they cannot be at the start or end",
        code: 100,
      },
    });
    expect(err.message).toBe(`${DENSITY} ${START} ${END}`);
  });

  test("graphErrorFromResponse detecta too many variables en el subcode", async () => {
    const { graphErrorFromResponse } = await import("../../src/services/meta-graph.client.js");
    const err = graphErrorFromResponse(400, {
      error: {
        message: "Invalid parameter",
        code: 100,
        error_subcode: "too many variables",
      },
    });
    expect(err.message).toBe(DENSITY);
    expect(err.meta.subcode).toBe("too many variables");
  });

  test("graphErrorFromResponse detecta start or end en el subcode", async () => {
    const { graphErrorFromResponse } = await import("../../src/services/meta-graph.client.js");
    const err = graphErrorFromResponse(400, {
      error: {
        message: "Invalid parameter",
        code: 100,
        error_subcode: "cannot be at the start or end",
      },
    });
    expect(err.message).toBe(`${START} ${END}`);
  });

  test("graphErrorFromResponse usa error_user_msg si message es genérico", async () => {
    const { graphErrorFromResponse } = await import("../../src/services/meta-graph.client.js");
    const err = graphErrorFromResponse(400, {
      error: {
        message: "(#100) Invalid parameter",
        code: 100,
        error_subcode: 2388023,
        error_user_msg: "The parameter text cannot have too many variables",
      },
    });
    expect(err.message).toBe(DENSITY);
    expect(err.meta.message).toBe("(#100) Invalid parameter");
    expect(err.meta.subcode).toBe(2388023);
  });

  test("graphErrorFromResponse no cambia el mapeo 190 si el message no habla de variables", async () => {
    const { graphErrorFromResponse } = await import("../../src/services/meta-graph.client.js");
    const err = graphErrorFromResponse(401, {
      error: { message: "Invalid OAuth access token", code: 190 },
    });
    expect(err.message).toBe("El token de WhatsApp ya no es válido. Vuelve a conectar la cuenta.");
  });

  test("resolveTemplateCrudToken prefiere el token del planner", async () => {
    await jest.unstable_mockModule("../../src/config/env.js", () => ({
      env: { meta: { accessToken: "sys_tok", appId: "app_1", graphVersion: "v21.0" } },
    }));
    const { resolveTemplateCrudToken } = await import("../../src/services/meta-graph.client.js");
    expect(resolveTemplateCrudToken("planner_tok")).toBe("planner_tok");
  });

  test("resolveTemplateCrudToken no cae al token de plataforma si falta el del planner", async () => {
    await jest.unstable_mockModule("../../src/config/env.js", () => ({
      env: { meta: { accessToken: "sys_tok", appId: "app_1", graphVersion: "v21.0" } },
    }));
    const { resolveTemplateCrudToken } = await import("../../src/services/meta-graph.client.js");
    expect(() => resolveTemplateCrudToken()).toThrow(/token de WhatsApp/i);
    expect(() => resolveTemplateCrudToken("")).toThrow(/token de WhatsApp/i);
  });

  test("resolveTemplateCrudToken 400 si el token del planner es el de la plataforma", async () => {
    await jest.unstable_mockModule("../../src/config/env.js", () => ({
      env: { meta: { accessToken: "sys_tok", appId: "app_1", graphVersion: "v21.0" } },
    }));
    const { resolveTemplateCrudToken } = await import("../../src/services/meta-graph.client.js");
    expect(() => resolveTemplateCrudToken("sys_tok")).toThrow(/token de la plataforma/i);
  });

  test("describeGraphToken distingue token de plataforma y token del planner", async () => {
    await jest.unstable_mockModule("../../src/config/env.js", () => ({
      env: { meta: { accessToken: "sys_tok", appId: "app_1", graphVersion: "v21.0" } },
    }));
    const { describeGraphToken } = await import("../../src/services/meta-graph.client.js");
    expect(describeGraphToken("sys_tok")).toEqual(expect.objectContaining({
      source: "META_ACCESS_TOKEN",
      equalsPlatform: true,
    }));
    expect(describeGraphToken("planner_tok")).toEqual(expect.objectContaining({
      source: "plannerAccessToken",
      equalsPlatform: false,
    }));
  });

  test("inspectGraphToken resume tipo, caducidad y WABAs del debug_token", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: {
          type: "USER",
          is_valid: true,
          expires_at: 1789000000,
          data_access_expires_at: 1789000000,
          scopes: ["whatsapp_business_management"],
          granular_scopes: [
            { scope: "whatsapp_business_management", target_ids: ["2187850965126759"] },
          ],
        },
      }),
    }));
    await jest.unstable_mockModule("../../src/config/env.js", () => ({
      env: { meta: { accessToken: "sys_tok", appId: "app_1", appSecret: "secret", graphVersion: "v21.0" } },
    }));
    const { inspectGraphToken } = await import("../../src/services/meta-graph.client.js");
    await expect(inspectGraphToken("EAA_USER")).resolves.toEqual({
      type: "USER",
      isValid: true,
      expiresAt: 1789000000,
      dataAccessExpiresAt: 1789000000,
      scopes: ["whatsapp_business_management"],
      targetIds: ["2187850965126759"],
    });
    const [url] = fetch.mock.calls[0];
    expect(url).toContain("/debug_token");
    expect(url).toContain("input_token=EAA_USER");
  });

  test("createMessageTemplate POST al WABA con Bearer del token recibido", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: "111" }),
    }));
    await jest.unstable_mockModule("../../src/config/env.js", () => ({
      env: { meta: { accessToken: "sys_tok", appId: "app_1", graphVersion: "v21.0", debugGraphToken: true } },
    }));
    const { createMessageTemplate } = await import("../../src/services/meta-graph.client.js");
    const out = await createMessageTemplate({
      wabaId: "waba_1",
      token: "sys_tok",
      payload: { name: "alanna_pc_abcd1234_1", language: "es_MX", category: "MARKETING", components: [] },
    });
    expect(out.id).toBe("111");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain("/waba_1/message_templates");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer sys_tok");
  });

  test("deleteMessageTemplate DELETE al WABA con hsm_id y name", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true }),
    }));
    await jest.unstable_mockModule("../../src/config/env.js", () => ({
      env: { meta: { accessToken: "sys_tok", appId: "app_1", graphVersion: "v21.0" } },
    }));
    const { deleteMessageTemplate } = await import("../../src/services/meta-graph.client.js");
    const out = await deleteMessageTemplate({
      wabaId: "waba_1",
      token: "sys_tok",
      name: "alanna_pc_ab12cd34_1",
      metaTemplateId: "meta_tpl_1",
    });
    expect(out.success).toBe(true);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain("/waba_1/message_templates");
    expect(url).toContain("hsm_id=meta_tpl_1");
    expect(url).toContain("name=alanna_pc_ab12cd34_1");
    expect(init.method).toBe("DELETE");
    expect(init.headers.Authorization).toBe("Bearer sys_tok");
  });

  test("deleteMessageTemplate DELETE al WABA con name si no hay metaTemplateId", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true }),
    }));
    await jest.unstable_mockModule("../../src/config/env.js", () => ({
      env: { meta: { accessToken: "sys_tok", appId: "app_1", graphVersion: "v21.0" } },
    }));
    const { deleteMessageTemplate } = await import("../../src/services/meta-graph.client.js");
    await deleteMessageTemplate({
      wabaId: "waba_1",
      token: "planner_tok",
      name: "alanna_pc_ab12cd34_1",
    });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain("/waba_1/message_templates");
    expect(url).toContain("name=alanna_pc_ab12cd34_1");
    expect(url).not.toContain("hsm_id=");
    expect(init.method).toBe("DELETE");
    expect(init.headers.Authorization).toBe("Bearer planner_tok");
  });

  test("shareClientWhatsappBusinessAccount POST OBO al portafolio con waba_id", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true }),
    }));
    await jest.unstable_mockModule("../../src/config/env.js", () => ({
      env: { meta: { accessToken: "sys_tok", businessId: "bm_1", appId: "app_1", graphVersion: "v21.0" } },
    }));
    const { shareClientWhatsappBusinessAccount } = await import("../../src/services/meta-graph.client.js");
    const out = await shareClientWhatsappBusinessAccount({
      wabaId: "2187850965126759",
      businessId: "bm_1",
      token: "sys_tok",
    });
    expect(out.success).toBe(true);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain("/bm_1/client_whatsapp_business_accounts");
    expect(url).toContain("waba_id=2187850965126759");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer sys_tok");
  });

  test("ensurePlatformCanManageWaba comparte el WABA y asigna el system user", async () => {
    global.fetch = jest.fn(async (url) => {
      const href = String(url);
      if (href.includes("/me?")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: "sys_user_1" }) };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
    });
    await jest.unstable_mockModule("../../src/config/env.js", () => ({
      env: { meta: { accessToken: "sys_tok", businessId: "bm_1", appId: "app_1", graphVersion: "v21.0" } },
    }));
    const { ensurePlatformCanManageWaba } = await import("../../src/services/meta-graph.client.js");
    const out = await ensurePlatformCanManageWaba({
      wabaId: "waba_1",
      plannerAccessToken: "planner_tok",
    });
    expect(out).toEqual(expect.objectContaining({ shared: true, assigned: true }));
    const urls = fetch.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes("/bm_1/client_whatsapp_business_accounts") && url.includes("waba_id=waba_1"))).toBe(true);
    expect(urls.some((url) => url.includes("/waba_1/assigned_users") && url.includes("user=sys_user_1"))).toBe(true);
    const shareCall = fetch.mock.calls.find(([url]) => String(url).includes("client_whatsapp_business_accounts"));
    expect(shareCall[1].headers.Authorization).toBe("Bearer planner_tok");
    const assignCall = fetch.mock.calls.find(([url]) => String(url).includes("/assigned_users"));
    expect(assignCall[1].headers.Authorization).toBe("Bearer planner_tok");
  });

  test("ensurePlatformCanManageWaba no trata Graph 100/33 'does not exist' como WABA ya vinculado", async () => {
    const missing = {
      error: {
        message:
          "Unsupported get request. Object with ID 'waba_1' does not exist, cannot be loaded due to missing permissions, or does not support this operation.",
        type: "GraphMethodException",
        code: 100,
        error_subcode: 33,
        fbtrace_id: "trace_33",
      },
    };
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify(missing),
    }));
    await jest.unstable_mockModule("../../src/config/env.js", () => ({
      env: { meta: { accessToken: "sys_tok", businessId: "bm_1", appId: "app_1", graphVersion: "v21.0" } },
    }));
    const { ensurePlatformCanManageWaba } = await import("../../src/services/meta-graph.client.js");
    const out = await ensurePlatformCanManageWaba({
      wabaId: "waba_1",
      plannerAccessToken: "planner_tok",
    });
    expect(out).toEqual(expect.objectContaining({ shared: false, assigned: false }));
  });

  test("ensurePlatformCanManageWaba sí ignora errores de WABA ya vinculado", async () => {
    global.fetch = jest.fn(async (url) => {
      const href = String(url);
      if (href.includes("client_whatsapp_business_accounts")) {
        return {
          ok: false,
          status: 400,
          text: async () =>
            JSON.stringify({
              error: {
                message: "This WhatsApp Business Account is already shared with the business.",
                code: 100,
              },
            }),
        };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
    });
    await jest.unstable_mockModule("../../src/config/env.js", () => ({
      env: {
        meta: {
          accessToken: "sys_tok",
          businessId: "bm_1",
          systemUserId: "sys_user_1",
          appId: "app_1",
          graphVersion: "v21.0",
        },
      },
    }));
    const { ensurePlatformCanManageWaba } = await import("../../src/services/meta-graph.client.js");
    const out = await ensurePlatformCanManageWaba({
      wabaId: "waba_1",
      plannerAccessToken: "planner_tok",
    });
    expect(out).toEqual(expect.objectContaining({ shared: true, assigned: true }));
  });
});
