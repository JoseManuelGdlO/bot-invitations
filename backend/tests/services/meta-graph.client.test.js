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
});
