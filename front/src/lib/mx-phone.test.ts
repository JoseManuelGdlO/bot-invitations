import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mxPhoneError, sanitizeMxPhoneInput } from "./mx-phone.ts";

describe("sanitizeMxPhoneInput", () => {
  test("deja solo dígitos y recorta a 10", () => {
    assert.equal(sanitizeMxPhoneInput("55 1234 5678"), "5512345678");
    assert.equal(sanitizeMxPhoneInput("55123456789"), "5512345678");
    assert.equal(sanitizeMxPhoneInput("abc55-12"), "5512");
  });

  test("quita lada de país 52 o 521 al pegar un número internacional", () => {
    assert.equal(sanitizeMxPhoneInput("+52 55 1234 5678"), "5512345678");
    assert.equal(sanitizeMxPhoneInput("5215512345678"), "5512345678");
    assert.equal(sanitizeMxPhoneInput("+52 1 999 123 4567"), "9991234567");
  });
});

describe("mxPhoneError", () => {
  test("exige el teléfono", () => {
    assert.equal(mxPhoneError(""), "El teléfono es requerido.");
    assert.equal(mxPhoneError("   "), "El teléfono es requerido.");
  });

  test("exige 10 dígitos con lada", () => {
    assert.equal(
      mxPhoneError("1234567"),
      "El teléfono debe tener 10 dígitos con lada (ej. 5512345678).",
    );
    assert.equal(
      mxPhoneError("55123456789"),
      "El teléfono debe tener 10 dígitos con lada (ej. 5512345678).",
    );
  });

  test("acepta 10 dígitos locales o el mismo número con +52", () => {
    assert.equal(mxPhoneError("5512345678"), null);
    assert.equal(mxPhoneError("55 1234 5678"), null);
    assert.equal(mxPhoneError("+52 55 1234 5678"), null);
    assert.equal(mxPhoneError("5215512345678"), null);
  });
});
