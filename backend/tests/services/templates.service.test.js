import { loadWithMocks, fakeEvent, fakeGuest } from "../helpers/loadWithMocks.js";

describe("templates.service opening constructor", () => {
  let service;
  let models;

  beforeEach(async () => {
    ({ mod: service, models } = await loadWithMocks("src/services/templates.service.js"));
  });

  test("composeConstructorMessage arma el shell de Meta", () => {
    expect(service.composeConstructorMessage("Luis", "Ana y Carlos. Los esperamos.")).toBe(
      "¡Hola, buen día! Luis\nNos comunicamos de Ana y Carlos. Los esperamos.\nMuchas gracias.",
    );
  });

  test("resolveOpeningParts interpola greetingVar y conserva saltos en {{2}}", () => {
    const parts = service.resolveOpeningParts(
      {
        greetingVar: "evento",
        body: "el equipo de {{planner}}.\nConfirma {{evento}} el {{fecha}}.",
      },
      fakeEvent(),
      fakeGuest(),
      "Ana López",
    );
    expect(parts.param1).toBe("Boda Ana");
    expect(parts.param2).toBe("el equipo de Ana López.\nConfirma Boda Ana el 2027-01-01.");
    expect(parts.text).toBe(
      "¡Hola, buen día! Boda Ana\nNos comunicamos de el equipo de Ana López.\nConfirma Boda Ana el 2027-01-01.\nMuchas gracias.",
    );
  });

  test("resolveOpeningParts conserva markup WhatsApp en {{2}}", () => {
    const parts = service.resolveOpeningParts(
      {
        greetingVar: "nombre",
        body: "RG Eventos de parte de:\n\n*Brenda & Denis*\n\npara {{evento}}.",
      },
      fakeEvent(),
      fakeGuest(),
      "Ana",
    );
    expect(parts.param2).toBe("RG Eventos de parte de:\n\n*Brenda & Denis*\n\npara Boda Ana.");
    expect(parts.text).toContain("*Brenda & Denis*");
  });

  test("resolveOpeningParts greetingVar inválido cae a nombre", () => {
    const parts = service.resolveOpeningParts(
      { greetingVar: "nope", body: "copy de {{nombre}}" },
      fakeEvent(),
      fakeGuest(),
      "Ana",
    );
    expect(parts.param1).toBe("Luis");
    expect(parts.param2).toBe("copy de Luis");
  });

  test("resolveOpeningParts sin plantilla usa openingMessage", () => {
    const parts = service.resolveOpeningParts(null, fakeEvent(), fakeGuest(), "Ana", "Hola {{nombre}}");
    expect(parts.param1).toBe("Luis");
    expect(parts.param2).toBe("Hola Luis");
    expect(parts.text).toContain("Nos comunicamos de Hola Luis");
  });

  test("resolveOpeningText usa Primer contacto guardado", async () => {
    models.Template.findOne.mockResolvedValue({
      category: "Primer contacto",
      greetingVar: "nombre",
      body: "{{evento}} sí",
    });
    const text = await service.resolveOpeningText(fakeEvent(), fakeGuest(), "Ana");
    expect(text).toBe(
      "¡Hola, buen día! Luis\nNos comunicamos de Boda Ana sí\nMuchas gracias.",
    );
  });
});
