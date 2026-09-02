import { jest } from "@jest/globals";
import { loadWithMocks, fakeEvent, fakeGuest } from "../helpers/loadWithMocks.js";

describe("templates.service opening constructor", () => {
  let service;
  let models;
  let getMessageTemplate;

  beforeEach(async () => {
    getMessageTemplate = jest.fn(async () => {
      const err = new Error("WhatsApp (Meta) no está configurado.");
      err.status = 400;
      throw err;
    });
    ({ mod: service, models } = await loadWithMocks("src/services/templates.service.js", {
      extraMocks: {
        "src/services/meta.client.js": () => ({
          metaClient: { getMessageTemplate },
          fillMetaTemplate: (bodyText, values = [], keys = []) => {
            const map = {};
            (keys.length ? keys : ["1", "2"]).forEach((key, i) => {
              map[String(key)] = values[i] ?? "";
            });
            return String(bodyText || "").replace(/\{\{([0-9]+|[A-Za-z_][A-Za-z0-9_]*)\}\}/g, (full, key) =>
              Object.prototype.hasOwnProperty.call(map, key) ? map[key] : full,
            );
          },
        }),
        "src/services/whatsapp-meta.service.js": () => ({
          resolveActiveWhatsappMetaByOwner: jest.fn(async () => {
            const err = new Error("WhatsApp (Meta) no está configurado.");
            err.status = 400;
            throw err;
          }),
        }),
      },
    }));
  });

  test("composeConstructorMessage arma el shell de Meta", () => {
    expect(service.composeConstructorMessage("Luis", "Ana y Carlos. Los esperamos.")).toBe(
      "¡Hola, buen día! Luis\nNos comunicamos de Ana y Carlos. Los esperamos.\nMuchas gracias.",
    );
  });

  test("normalizeOpeningSlots aplana saltos y dual-write greetingVar/body", () => {
    expect(
      service.normalizeOpeningSlots({
        greetingVar: "evento",
        body: "Ana y Carlos.\nLos esperamos.",
      }),
    ).toEqual({
      bodyVars: ["{{evento}}", "Ana y Carlos. Los esperamos."],
      greetingVar: "evento",
      body: "Ana y Carlos. Los esperamos.",
    });
  });

  test("normalizeOpeningSlots usa bodyVars si vienen", () => {
    expect(
      service.normalizeOpeningSlots({
        bodyVars: ["{{nombre}}", "copy\nlibre", "tercero"],
        greetingVar: "evento",
        body: "viejo",
      }),
    ).toEqual({
      bodyVars: ["{{nombre}}", "copy libre", "tercero"],
      greetingVar: "nombre",
      body: "copy libre",
    });
  });

  test("resolveOpeningParts interpola greetingVar y aplana saltos en slots", async () => {
    const parts = await service.resolveOpeningParts(
      {
        greetingVar: "evento",
        body: "el equipo de {{planner}}.\nConfirma {{evento}} el {{fecha}}.",
      },
      fakeEvent(),
      fakeGuest(),
      "Ana López",
    );
    expect(parts.param1).toBe("Boda Ana");
    expect(parts.param2).toBe("el equipo de Ana López. Confirma Boda Ana el 2027-01-01.");
    expect(parts.params).toEqual(["Boda Ana", "el equipo de Ana López. Confirma Boda Ana el 2027-01-01."]);
    expect(parts.text).toBe(
      "¡Hola, buen día! Boda Ana\nNos comunicamos de el equipo de Ana López. Confirma Boda Ana el 2027-01-01.\nMuchas gracias.",
    );
  });

  test("resolveOpeningParts conserva markup WhatsApp y aplana saltos", async () => {
    const parts = await service.resolveOpeningParts(
      {
        greetingVar: "nombre",
        body: "RG Eventos de parte de:\n\n*Brenda & Denis*\n\npara {{evento}}.",
      },
      fakeEvent(),
      fakeGuest(),
      "Ana",
    );
    expect(parts.param2).toBe("RG Eventos de parte de: *Brenda & Denis* para Boda Ana.");
    expect(parts.text).toContain("*Brenda & Denis*");
  });

  test("resolveOpeningParts greetingVar inválido cae a nombre", async () => {
    const parts = await service.resolveOpeningParts(
      { greetingVar: "nope", body: "copy de {{nombre}}" },
      fakeEvent(),
      fakeGuest(),
      "Ana",
    );
    expect(parts.param1).toBe("Luis");
    expect(parts.param2).toBe("copy de Luis");
  });

  test("resolveOpeningParts sin plantilla usa openingMessage", async () => {
    const parts = await service.resolveOpeningParts(null, fakeEvent(), fakeGuest(), "Ana", "Hola {{nombre}}");
    expect(parts.param1).toBe("Luis");
    expect(parts.param2).toBe("Hola Luis");
    expect(parts.text).toContain("Nos comunicamos de Hola Luis");
  });

  test("resolveOpeningParts usa bodyVars y el BODY de Meta", async () => {
    getMessageTemplate.mockResolvedValue({
      body: {
        text: "Hola {{1}}, te escribimos de {{2}}.",
        parameters: [{ key: "1" }, { key: "2" }],
      },
      footer: { text: "Gracias" },
    });
    const { mod } = await loadWithMocks("src/services/templates.service.js", {
      extraMocks: {
        "src/services/meta.client.js": () => ({
          metaClient: { getMessageTemplate },
          fillMetaTemplate: (bodyText, values = []) =>
            String(bodyText || "")
              .replace("{{1}}", values[0] ?? "")
              .replace("{{2}}", values[1] ?? ""),
        }),
        "src/services/whatsapp-meta.service.js": () => ({
          resolveActiveWhatsappMetaByOwner: jest.fn(async () => ({
            credentials: { accessToken: "tok", wabaId: "waba_1" },
          })),
        }),
      },
    });
    const parts = await mod.resolveOpeningParts(
      {
        bodyVars: ["{{nombre}}", "el equipo de {{evento}}"],
        greetingVar: "nombre",
        body: "viejo",
      },
      fakeEvent(),
      fakeGuest(),
      "Ana",
    );
    expect(parts.params).toEqual(["Luis", "el equipo de Boda Ana"]);
    expect(parts.text).toBe("Hola Luis, te escribimos de el equipo de Boda Ana.\nGracias");
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
