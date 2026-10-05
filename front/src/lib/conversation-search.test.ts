import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  matchesConversationFilter,
  matchesConversationSearch,
  normalizePhoneDigits,
} from "./conversation-search.ts";

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

describe("matchesConversationFilter", () => {
  const row = (
    status: string,
    unread = 0,
    aiPaused = false,
  ) => ({
    guest: { status },
    conv: { unread, aiPaused },
  });

  test("todos deja pasar cualquier fila", () => {
    assert.equal(matchesConversationFilter(row("confirmado", 3, true), "todos"), true);
    assert.equal(matchesConversationFilter(row("enviado"), ""), true);
  });

  test("sin contestar agrupa quienes no han respondido", () => {
    assert.equal(matchesConversationFilter(row("sin_contactar"), "sin_contestar"), true);
    assert.equal(matchesConversationFilter(row("enviado"), "sin_contestar"), true);
    assert.equal(matchesConversationFilter(row("entregado"), "sin_contestar"), true);
    assert.equal(matchesConversationFilter(row("reagendado"), "sin_contestar"), true);
    assert.equal(matchesConversationFilter(row("en_conversacion"), "sin_contestar"), false);
    assert.equal(matchesConversationFilter(row("confirmado"), "sin_contestar"), false);
  });

  test("sin leer exige mensajes pendientes", () => {
    assert.equal(matchesConversationFilter(row("confirmado", 2), "sin_leer"), true);
    assert.equal(matchesConversationFilter(row("confirmado", 0), "sin_leer"), false);
    assert.equal(
      matchesConversationFilter({ guest: { status: "enviado" }, conv: null }, "sin_leer"),
      false,
    );
  });

  test("tomada exige la automatización en pausa", () => {
    assert.equal(matchesConversationFilter(row("en_conversacion", 0, true), "tomada"), true);
    assert.equal(matchesConversationFilter(row("en_conversacion", 1, false), "tomada"), false);
  });

  test("un estado concreto solo coincide con ese estado", () => {
    assert.equal(matchesConversationFilter(row("confirmado"), "confirmado"), true);
    assert.equal(matchesConversationFilter(row("parcial"), "confirmado"), false);
    assert.equal(matchesConversationFilter(row("seguimiento"), "seguimiento"), true);
  });
});

describe("normalizePhoneDigits", () => {
  test("quita espacios y símbolos", () => {
    assert.equal(normalizePhoneDigits("+52 999-123-4567"), "529991234567");
  });
});
