import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { matchesConversationSearch, normalizePhoneDigits } from "./conversation-search.ts";

const guest = { rep: "Joel Pérez", phone: "+52 999 123 4567" };

describe("matchesConversationSearch", () => {
  test("vacío coincide con todos", () => {
    assert.equal(matchesConversationSearch(guest, ""), true);
    assert.equal(matchesConversationSearch(guest, "   "), true);
  });

  test("busca por nombre", () => {
    assert.equal(matchesConversationSearch(guest, "joel"), true);
    assert.equal(matchesConversationSearch(guest, "Pérez"), true);
    assert.equal(matchesConversationSearch(guest, "ana"), false);
  });

  test("busca por teléfono con dígitos parciales", () => {
    assert.equal(matchesConversationSearch(guest, "999"), true);
    assert.equal(matchesConversationSearch(guest, "1234567"), true);
    assert.equal(matchesConversationSearch(guest, "52 999"), true);
    assert.equal(matchesConversationSearch(guest, "111"), false);
  });

  test("no exige coincidencia de nombre para un número", () => {
    assert.equal(matchesConversationSearch(guest, "999123"), true);
  });

  test("sin invitado no coincide", () => {
    assert.equal(matchesConversationSearch(null, "joel"), false);
  });
});

describe("normalizePhoneDigits", () => {
  test("quita espacios y símbolos", () => {
    assert.equal(normalizePhoneDigits("+52 999-123-4567"), "529991234567");
  });
});
