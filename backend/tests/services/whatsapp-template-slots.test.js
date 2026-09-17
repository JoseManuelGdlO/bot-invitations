import {
  assertMetaTemplateBody,
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

const ERROR_EMPTY = "El cuerpo no puede estar vacío.";
const ERROR_START = "Las variables no pueden ir al principio del mensaje.";
const ERROR_END = "Las variables no pueden ir al final del mensaje.";
const ERROR_ADJACENT =
  "No pongas dos variables seguidas. Separa {{1}} y {{2}} con texto.";
const ERROR_DENSITY =
  "Esta plantilla tiene demasiadas variables en relación con su longitud. Reduce el número de variables o aumenta la longitud del mensaje.";
const ERROR_REQUIRED =
  "Incluye {{1}} (nombre) y {{2}} (número de pases). Las dos son obligatorias.";
const ERROR_SEQUENCE =
  "Usa {{1}}, {{2}}, {{3}}… en orden, sin saltos. {{1}} es el nombre y {{2}} el número de pases.";
const ERROR_LENGTH = "El cuerpo no puede superar 1024 caracteres.";

const OK_BODY =
  "Hola {{1}}, tienes {{2}} pases reservados. Confirma por este chat, por favor.";
const PRESET_FORMAL =
  "Hola {{1}}, te escribimos para invitarte con mucho gusto a nuestra celebración. Reservamos {{2}} pases a tu nombre. Confírmanos tu asistencia por este chat cuando puedas, por favor.";
const PRESET_CERCANO =
  "¡Hola {{1}}! Qué gusto saludarte. Guardamos {{2}} lugares para ti en nuestra celebración. Responde a este mensaje para confirmar si nos acompañas, por favor.";
const PRESET_EVENTO =
  "Hola {{1}}, te invitamos a {{3}}. Reservamos {{2}} pases a tu nombre. Te esperamos el {{4}} en {{5}}. Confirma tu asistencia respondiendo este mensaje, por favor.";
const EXTRA_OK =
  "Hola {{1}}, tienes {{2}} pases reservados para {{3}}. Confirma por este chat cuando puedas, por favor.";
const SEQUENCE_GAP =
  "Hola {{1}}, te invitamos con mucho gusto a confirmar el {{3}} por este chat cuando puedas, por favor.";

describe("whatsapp-template-slots", () => {
  test("assertMetaTemplateBody acepta el cuerpo ok de §5.2", () => {
    expect(assertMetaTemplateBody(OK_BODY)).toEqual(["1", "2"]);
  });

  test("assertMetaTemplateBody rechaza variable al inicio", () => {
    expect(() =>
      assertMetaTemplateBody("{{1}} te invitamos… pases {{2}}."),
    ).toThrow(ERROR_START);
  });

  test("assertMetaTemplateBody rechaza variable al final", () => {
    expect(() => assertMetaTemplateBody("Hola {{1}}, pases {{2}}")).toThrow(
      ERROR_END,
    );
  });

  test("assertMetaTemplateBody rechaza placeholders adyacentes", () => {
    expect(() =>
      assertMetaTemplateBody("Hola {{1}}{{2}} confirma por favor."),
    ).toThrow(ERROR_ADJACENT);
  });

  test("assertMetaTemplateBody rechaza el cuerpo corto con {{1}} {{3}} {{2}}", () => {
    expect(() =>
      assertMetaTemplateBody("Hola {{1}}, {{3}} y {{2}} listo."),
    ).toThrow(ERROR_DENSITY);
  });

  test("assertMetaTemplateBody rechaza densidad baja", () => {
    expect(() =>
      assertMetaTemplateBody("Hola {{1}} y {{2}} y {{3}} y {{4}} ok."),
    ).toThrow(ERROR_DENSITY);
  });

  test("assertMetaTemplateBody acepta cuerpos cortos ya aprobados por Meta", () => {
    expect(
      assertMetaTemplateBody("Hola {{1}} tienes {{2}} pases de invitado."),
    ).toEqual(["1", "2"]);
    expect(
      assertMetaTemplateBody(
        "Hola {{1}} tienes {{2}} pases de invitado. {{3}} texto extra.",
      ),
    ).toEqual(["1", "2", "3"]);
  });

  test("assertMetaTemplateBody rechaza Hola {{1}} por final y variables incompletas", () => {
    expect(() => assertMetaTemplateBody("Hola {{1}}")).toThrow(ERROR_END);
  });

  test.each([
    ["Formal", PRESET_FORMAL, ["1", "2"]],
    ["Cercano", PRESET_CERCANO, ["1", "2"]],
    ["Con evento", PRESET_EVENTO, ["1", "2", "3", "4", "5"]],
  ])("assertMetaTemplateBody acepta preset %s", (_name, body, ids) => {
    expect(assertMetaTemplateBody(body)).toEqual(ids);
  });

  test("assertMetaTemplateBody rechaza cuerpo vacío", () => {
    expect(() => assertMetaTemplateBody("")).toThrow(ERROR_EMPTY);
    expect(() => assertMetaTemplateBody("   \n")).toThrow(ERROR_EMPTY);
  });

  test("assertMetaTemplateBody rechaza hueco de secuencia {{1}} {{3}}", () => {
    expect(() => assertMetaTemplateBody(SEQUENCE_GAP)).toThrow(ERROR_SEQUENCE);
  });

  test("assertMetaTemplateBody rechaza más de 1024 caracteres", () => {
    const padded = OK_BODY + "x".repeat(1025 - OK_BODY.length);
    expect(padded).toHaveLength(1025);
    expect(() => assertMetaTemplateBody(padded)).toThrow(ERROR_LENGTH);
    expect(assertMetaTemplateBody(OK_BODY + "x".repeat(1024 - OK_BODY.length))).toEqual(
      ["1", "2"],
    );
  });

  test("assertWizardBody exige {{1}} y {{2}} y un cuerpo válido para Meta", () => {
    expect(() => assertWizardBody("Hola")).toThrow(/\{\{1\}\}/);
    expect(() => assertWizardBody("Hola {{1}}")).toThrow(ERROR_END);
    expect(() => assertWizardBody(SEQUENCE_GAP)).toThrow(ERROR_SEQUENCE);
    expect(assertWizardBody(OK_BODY)).toEqual(["1", "2"]);
  });

  test("assertWizardBody acepta {{3}} si el cuerpo cumple Meta", () => {
    expect(assertWizardBody(EXTRA_OK)).toEqual(["1", "2", "3"]);
  });

  test.each(["{{0}}", "{{02}}"])(
    "assertWizardBody rechaza el placeholder no canónico %s",
    (placeholder) => {
      expect(() =>
        assertWizardBody(
          `Hola {{1}}, tienes {{2}} pases y el extra ${placeholder} confirma por este chat, por favor.`,
        ),
      ).toThrow(ERROR_SEQUENCE);
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

  test("generateTemplateName usa prefijo por propósito", () => {
    expect(generateTemplateName(1, "reminder")).toMatch(/^alanna_rm_[a-f0-9]{8}_1$/);
    expect(generateTemplateName(2, "followup")).toMatch(/^alanna_sg_[a-f0-9]{8}_2$/);
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
