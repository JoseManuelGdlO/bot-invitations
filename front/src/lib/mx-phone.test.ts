import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { guestPhoneError, isUsGuestPhone, mxPhoneError, sanitizeGuestPhoneInput, sanitizeMxPhoneInput } from "./mx-phone.ts";

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

describe("sanitizeGuestPhoneInput", () => {
  test("conserva 10 dígitos o la lada más 10", () => {
    assert.equal(sanitizeGuestPhoneInput("618 321 8624"), "6183218624");
    assert.equal(sanitizeGuestPhoneInput("+1 817-727-2994"), "18177272994");
    assert.equal(sanitizeGuestPhoneInput("5216183218624"), "5216183218624");
  });

  test("recorta a 15 dígitos", () => {
    assert.equal(sanitizeGuestPhoneInput("123456789012345678"), "123456789012345");
  });
});

describe("isUsGuestPhone", () => {
  test("marca lada 1 con 10 dígitos locales o el 1 ya incluido", () => {
    assert.equal(isUsGuestPhone("18177272994"), true);
    assert.equal(isUsGuestPhone("+1 817-727-2994"), true);
    assert.equal(isUsGuestPhone("1668222044"), true);
    assert.equal(isUsGuestPhone("6183218624"), false);
    assert.equal(isUsGuestPhone("5216183218624"), false);
    assert.equal(isUsGuestPhone("+52 1 618 155 6489"), false);
    assert.equal(isUsGuestPhone("+5216181825267"), false);
  });
});

describe("guestPhoneError", () => {
  test("acepta México de 10 dígitos y otros países con lada", () => {
    assert.equal(guestPhoneError("5512345678"), null);
    assert.equal(guestPhoneError("18177272994"), null);
    assert.equal(guestPhoneError("+52 1 618 321 8624"), null);
  });

  test("rechaza vacío, corto o más de 15 dígitos", () => {
    assert.equal(guestPhoneError(""), "El teléfono es requerido.");
    assert.equal(guestPhoneError("12345"), "Usa 10 dígitos (México) o la lada del país más 10 dígitos. Ej. 5512345678 o 18177272994.");
    assert.equal(guestPhoneError("1234567890123456"), "Usa 10 dígitos (México) o la lada del país más 10 dígitos. Ej. 5512345678 o 18177272994.");
  });
});
