import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { EventItem, Guest } from "./mock/types.ts";
import { availableTemplateKeys } from "./template-vars.ts";

function event(overrides: Partial<EventItem> = {}): EventItem {
  return {
    id: "e1",
    name: "Boda Ana y Luis",
    shortName: "AL",
    type: "Boda",
    hosts: "Ana y Luis",
    date: "2026-10-10",
    time: "18:00",
    timezone: "America/Mexico_City",
    venue: "Hacienda",
    address: "",
    estimatedGuests: 100,
    cover: "",
    status: "activo",
    ...overrides,
  };
}

function guest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "g1",
    eventId: "e1",
    rep: "Laura Escobedo",
    phone: "+529991111111",
    invited: 2,
    confirmed: 0,
    table: "",
    family: "",
    guestType: "",
    notes: "",
    tag: "",
    status: "sin_contactar",
    whatsapp: "pendiente",
    lastMessage: "",
    lastReply: "",
    lastReplyAt: "",
    followUp: "",
    ...overrides,
  };
}

describe("availableTemplateKeys", () => {
  test("sin invitados solo incluye identidad y datos del evento", () => {
    assert.deepEqual(availableTemplateKeys([], event()), [
      "nombre",
      "nombre_completo",
      "numero_invitados",
      "numero_confirmados",
      "evento",
      "fecha",
      "lugar",
      "hora",
      "planner",
    ]);
  });

  test("incluye direccion cuando el evento tiene address", () => {
    const keys = availableTemplateKeys(
      [],
      event({ address: "Calle 10, Mérida" }),
    );
    assert.ok(keys.includes("direccion"));
    assert.deepEqual(keys, [
      "nombre",
      "nombre_completo",
      "numero_invitados",
      "numero_confirmados",
      "evento",
      "fecha",
      "lugar",
      "direccion",
      "hora",
      "planner",
    ]);
  });

  test("incluye mesa y familia si algún invitado las tiene", () => {
    const keys = availableTemplateKeys(
      [guest({ table: "Mesa 2", family: "Escobedo" })],
      event(),
    );
    assert.ok(keys.includes("mesa"));
    assert.ok(keys.includes("familia"));
    assert.ok(!keys.includes("tipo"));
    assert.ok(!keys.includes("notas"));
    assert.ok(!keys.includes("etiqueta"));
  });

  test("incluye customData y omite opcionales vacíos", () => {
    const keys = availableTemplateKeys(
      [guest({ customData: { menu_especial: "vegano", alergias: "nueces" } })],
      event(),
    );
    assert.deepEqual(keys, [
      "nombre",
      "nombre_completo",
      "numero_invitados",
      "numero_confirmados",
      "evento",
      "fecha",
      "lugar",
      "hora",
      "planner",
      "alergias",
      "menu_especial",
    ]);
  });
});
