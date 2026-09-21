import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decodeGoogleCredential } from "./decode-google-credential.ts";

function tokenWith(payload: Record<string, unknown>) {
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `hdr.${json}.sig`;
}

describe("decodeGoogleCredential", () => {
  test("lee email y nombre", () => {
    const token = tokenWith({
      email: "Ana@Test.com",
      given_name: "Ana",
      family_name: "López",
    });
    assert.deepEqual(decodeGoogleCredential(token), {
      email: "ana@test.com",
      name: "Ana López",
    });
  });

  test("token inválido no lanza", () => {
    assert.deepEqual(decodeGoogleCredential("nope"), { email: "", name: "" });
  });
});
