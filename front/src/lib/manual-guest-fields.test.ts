import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  customDataFromManualFields,
  manualGuestFields,
} from "./manual-guest-fields.ts";
import type { Guest } from "./mock/types.ts";

function guest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "g1",
    eventId: "e1",
    rep: "Laura",
    phone: "5511111111",
    invited: 1,
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

describe("manualGuestFields", () => {
  test("siempre incluye enlace e imagen", () => {
    assert.deepEqual(
      manualGuestFields([]).map((field) => field.id),
      ["enlace", "image"],
    );
  });

  test("agrega columnas extra que ya usan otros invitados", () => {
    const fields = manualGuestFields([
      guest({ customData: { menu_especial: "vegano", enlace: "abc" } }),
    ]);
    assert.deepEqual(
      fields.map((field) => field.id),
      ["enlace", "image", "menu_especial"],
    );
    assert.equal(fields[0]?.hint, "{{enlace}}");
    assert.equal(fields[2]?.hint, "{{menu_especial}}");
  });
});

describe("customDataFromManualFields", () => {
  test("omite la imagen y los valores vacíos", () => {
    assert.deepEqual(
      customDataFromManualFields({
        enlace: " https://pase.example/a ",
        image: "https://cdn.example/a.png",
        menu_especial: "  ",
        alergias: "nueces",
      }),
      {
        enlace: "https://pase.example/a",
        alergias: "nueces",
      },
    );
  });
});
