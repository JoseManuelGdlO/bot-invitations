import {
  assertWizardBody,
  bodyTextFromComponents,
  defaultSlotMappings,
  mergeSlotMappings,
  assertSlotMappingsComplete,
  exampleValuesFromMappings,
  generateTemplateName,
  buildTemplateComponents,
  resolveSlotParamValues,
  LOCKED_SLOT_MAPPINGS,
} from "../../src/services/whatsapp-template-slots.js";

describe("whatsapp-template-slots", () => {
  test("assertWizardBody exige {{1}} y {{2}} consecutivos", () => {
    expect(() => assertWizardBody("Hola")).toThrow(/\{\{1\}\}/);
    expect(() => assertWizardBody("Hola {{1}}")).toThrow(/\{\{2\}\}/);
    expect(() => assertWizardBody("Hola {{1}} pases {{3}}")).toThrow(/hueco|consecutiv/i);
    expect(assertWizardBody("Hola {{1}}, pases {{2}}")).toEqual(["1", "2"]);
  });

  test.each(["{{0}}", "{{02}}"])(
    "assertWizardBody rechaza el placeholder no canónico %s",
    (placeholder) => {
      expect(() => assertWizardBody(`Hola {{1}} {{2}} ${placeholder}`)).toThrow(/consecutiv/i);
    },
  );

  test("defaultSlotMappings fija 1=nombre y 2=pases", () => {
    expect(defaultSlotMappings("Hola {{1}} {{2}} {{3}}")).toEqual({
      "1": LOCKED_SLOT_MAPPINGS["1"],
      "2": LOCKED_SLOT_MAPPINGS["2"],
      "3": null,
    });
  });

  test("mergeSlotMappings rechaza remapear 1 y 2", () => {
    expect(() =>
      mergeSlotMappings("Hola {{1}} {{2}}", {
        "1": { type: "field", key: "fecha" },
        "2": { type: "field", key: "numero_invitados" },
      }),
    ).toThrow(/\{\{1\}\}/);
  });

  test("assertSlotMappingsComplete exige extras mapeados", () => {
    const body = "Hola {{1}} {{2}} el {{3}}";
    const partial = mergeSlotMappings(body, {});
    expect(() => assertSlotMappingsComplete(body, partial)).toThrow(/\{\{3\}\}/);
    const full = mergeSlotMappings(body, { "3": { type: "field", key: "fecha" } });
    expect(assertSlotMappingsComplete(body, full)["3"]).toEqual({ type: "field", key: "fecha" });
  });

  test.each([{ type: "literal" }, { type: "literal", value: "" }])(
    "assertSlotMappingsComplete rechaza literales sin valor",
    (invalidLiteral) => {
      const body = "Hola {{1}} {{2}} {{3}}";
      const mappings = mergeSlotMappings(body, { "3": invalidLiteral });
      expect(() => assertSlotMappingsComplete(body, mappings)).toThrow(/\{\{3\}\}/);
    },
  );

  test("exampleValuesFromMappings usa María y 2", () => {
    expect(
      exampleValuesFromMappings({
        "1": LOCKED_SLOT_MAPPINGS["1"],
        "2": LOCKED_SLOT_MAPPINGS["2"],
        "3": { type: "literal", value: "Durango" },
      }),
    ).toEqual(["María", "2", "Durango"]);
  });

  test("generateTemplateName cumple el patrón Meta", () => {
    const name = generateTemplateName(1);
    expect(name).toMatch(/^alanna_pc_[a-f0-9]{8}_1$/);
  });

  test("buildTemplateComponents BODY + header document", () => {
    const components = buildTemplateComponents({
      headerType: "document",
      headerHandle: "4::handle",
      bodyText: "Hola {{1}}, pases {{2}}",
      exampleValues: ["María", "2"],
    });
    expect(components[0]).toMatchObject({
      type: "HEADER",
      format: "DOCUMENT",
      example: { header_handle: ["4::handle"] },
    });
    expect(components[1]).toMatchObject({
      type: "BODY",
      text: "Hola {{1}}, pases {{2}}",
      example: { body_text: [["María", "2"]] },
    });
  });

  test("resolveSlotParamValues usa vars del invitado", () => {
    expect(
      resolveSlotParamValues(
        {
          "1": LOCKED_SLOT_MAPPINGS["1"],
          "2": LOCKED_SLOT_MAPPINGS["2"],
          "3": { type: "literal", value: "Octubre" },
        },
        { nombre: "Luis", numero_invitados: "3", fecha: "2026-11-14" },
      ),
    ).toEqual(["Luis", "3", "Octubre"]);
  });

  test("bodyTextFromComponents lee el BODY del snapshot", () => {
    expect(
      bodyTextFromComponents([
        { type: "HEADER", format: "IMAGE" },
        { type: "BODY", text: "Hola {{1}}, pases {{2}}" },
      ]),
    ).toBe("Hola {{1}}, pases {{2}}");
  });
});
