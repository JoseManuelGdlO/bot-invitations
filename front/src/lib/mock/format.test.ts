import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { guestLastResponse } from "./format.ts";

describe("guestLastResponse", () => {
  test("prioriza la respuesta del invitado", () => {
    assert.deepEqual(
      guestLastResponse({
        lastReply: "Sí vamos",
        deliveryError: "Este mensaje no llegó para mantener un ecosistema sano.",
      }),
      { kind: "reply", text: "Sí vamos" },
    );
  });

  test("muestra el error de entrega si no hay respuesta", () => {
    assert.deepEqual(
      guestLastResponse({
        lastReply: "",
        deliveryError: "Este mensaje no llegó para mantener un ecosistema sano.",
      }),
      {
        kind: "error",
        text: "Este mensaje no llegó para mantener un ecosistema sano.",
      },
    );
  });

  test("vacío si no hay respuesta ni error", () => {
    assert.equal(guestLastResponse({ lastReply: "", deliveryError: "" }), null);
  });
});
