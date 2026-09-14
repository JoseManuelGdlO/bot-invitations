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

  test("resolveTemplateCrudToken prefiere META_ACCESS_TOKEN", async () => {
    await jest.unstable_mockModule("../../src/config/env.js", () => ({
      env: { meta: { accessToken: "sys_tok", appId: "app_1", graphVersion: "v21.0" } },
    }));
    const { resolveTemplateCrudToken } = await import("../../src/services/meta-graph.client.js");
    expect(resolveTemplateCrudToken("planner_tok")).toBe("sys_tok");
  });

  test("describeGraphToken distingue token de plataforma y token del planner", async () => {
    await jest.unstable_mockModule("../../src/config/env.js", () => ({
      env: { meta: { accessToken: "sys_tok", appId: "app_1", graphVersion: "v21.0" } },
    }));
    const { describeGraphToken } = await import("../../src/services/meta-graph.client.js");
    expect(describeGraphToken("sys_tok")).toEqual(expect.objectContaining({
      source: "META_ACCESS_TOKEN",
    }));
    expect(describeGraphToken("planner_tok")).toEqual(expect.objectContaining({
      source: "plannerAccessToken",
    }));
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
    await expect(
      ensurePlatformCanManageWaba({
        wabaId: "waba_1",
        plannerAccessToken: "planner_tok",
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/no tiene acceso a este WABA/i),
    });
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
