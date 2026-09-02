import { summarizeMetaError, summarizeMetaErrors } from "../../src/utils/meta-error.js";

describe("summarizeMetaError", () => {
  test("lee Graph error.code error_data.details y fbtrace_id", () => {
    expect(
      summarizeMetaError({
        error: {
          message: "(#131026) Message undeliverable",
          type: "OAuthException",
          code: 131026,
          error_subcode: 33,
          error_data: { details: "Message Undeliverable." },
          fbtrace_id: "ABC123",
        },
      }),
    ).toEqual({
      code: 131026,
      subcode: 33,
      type: "OAuthException",
      title: null,
      message: "(#131026) Message undeliverable",
      details: "Message Undeliverable.",
      fbtraceId: "ABC123",
      href: null,
    });
  });

  test("lee error de webhook status.errors", () => {
    expect(
      summarizeMetaError({
        code: 131026,
        title: "Message undeliverable",
        message: "Message undeliverable",
        error_data: { details: "Generic user error" },
        href: "https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/",
      }),
    ).toMatchObject({
      code: 131026,
      title: "Message undeliverable",
      details: "Generic user error",
    });
  });

  test("no pierde details si ya venía resumido", () => {
    const once = summarizeMetaError({
      code: 131026,
      message: "Message undeliverable",
      error_data: { details: "Message Undeliverable." },
    });
    expect(summarizeMetaError(once).details).toBe("Message Undeliverable.");
  });
});

describe("summarizeMetaErrors", () => {
  test("ignora entradas vacías", () => {
    expect(summarizeMetaErrors([{}, { code: 100, message: "bad" }])).toEqual([
      expect.objectContaining({ code: 100, message: "bad" }),
    ]);
  });
});
