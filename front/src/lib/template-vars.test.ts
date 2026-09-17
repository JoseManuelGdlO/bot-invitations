import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { EventItem, Guest } from "./mock/types.ts";
import { availableTemplateKeys, interpolateMetaTemplate } from "./template-vars.ts";
import { mergeEventSlotMappings } from "./whatsapp-templates.ts";

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

describe("interpolateMetaTemplate", () => {
  const body =
    "Hola {{1}}, tienes {{2}} pases reservados para el evento.";

  test("sustituye {{1}} con el nombre y {{2}} con el número de pases", () => {
    const text = interpolateMetaTemplate(
      body,
      mergeEventSlotMappings(body, {}),
      guest(),
      event(),
    );
    assert.equal(
      text,
      "Hola Laura, tienes 2 pases reservados para el evento.",
    );
  });

  test("sustituye extras mapeadas a un campo del evento", () => {
    const extraBody =
      "Hola {{1}}, el evento es en {{3}} y tienes {{2}} pases.";
    const text = interpolateMetaTemplate(
      extraBody,
      mergeEventSlotMappings(extraBody, {
        "3": { type: "field", key: "lugar" },
      }),
      guest(),
      event(),
    );
    assert.equal(
      text,
      "Hola Laura, el evento es en Hacienda y tienes 2 pases.",
    );
  });

  test("sustituye extras mapeadas a texto fijo", () => {
    const extraBody =
      "Hola {{1}}, código de vestimenta {{3}} y tienes {{2}} pases.";
    const text = interpolateMetaTemplate(
      extraBody,
      mergeEventSlotMappings(extraBody, {
        "3": { type: "literal", value: "formal" },
      }),
      guest(),
      event(),
    );
    assert.equal(
      text,
      "Hola Laura, código de vestimenta formal y tienes 2 pases.",
    );
  });

  test("deja {{n}} si el mapping extra está incompleto", () => {
    const extraBody =
      "Hola {{1}}, nos vemos en {{3}} y tienes {{2}} pases.";
    const text = interpolateMetaTemplate(
      extraBody,
      mergeEventSlotMappings(extraBody, {}),
      guest(),
      event(),
    );
    assert.equal(
      text,
      "Hola Laura, nos vemos en {{3}} y tienes 2 pases.",
    );
  });
});
