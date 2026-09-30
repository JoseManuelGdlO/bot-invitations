import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  guestTemplateHeaders,
  imageImportStatus,
  REQUIRED_TEMPLATE_FIELD_IDS,
  TEMPLATE_FIELD_HEADERS,
} from "./import-fields.ts";

describe("guestTemplateHeaders", () => {
  test("siempre incluye nombre y teléfono aunque no vengan seleccionados", () => {
    assert.deepEqual(guestTemplateHeaders([], []), [
      TEMPLATE_FIELD_HEADERS.rep,
      TEMPLATE_FIELD_HEADERS.phone,
    ]);
  });

  test("respeta el orden de campos mapeados y luego las custom", () => {
    assert.deepEqual(
      guestTemplateHeaders(["tag", "phone", "rep", "table"], [
        "Menú especial",
        "  Alergias  ",
        "",
      ]),
      ["Nombre", "Teléfono", "Mesa", "Etiqueta", "Menú especial", "Alergias"],
    );
  });

  test("incluye Imagen cuando se selecciona", () => {
    assert.deepEqual(guestTemplateHeaders(["rep", "phone", "image"], []), [
      "Nombre",
      "Teléfono",
      "Imagen",
    ]);
  });

  test("detecta imagen incrustada y enlace https en la columna mapeada", () => {
    assert.deepEqual(
      imageImportStatus(
        ["Nombre", "Teléfono", "Imagen"],
        [
          ["Ana", "5511111111", "(imagen)"],
          ["Luis", "5522222222", "QR"],
          ["Mara", "5533333333", ""],
        ],
        { Nombre: "rep", Teléfono: "phone", Imagen: "image" },
        {
          sheetRows: [2, 3, 4],
          hyperlinks: [
            ["", "", ""],
            ["", "", "https://cdn.example/qr.png"],
            ["", "", ""],
          ],
          embeddedImageCells: ["2:3"],
        },
      ),
      ["image", "link", "empty"],
    );
  });

  test("los requeridos coinciden con encabezados auto-mapeables", () => {
    assert.deepEqual([...REQUIRED_TEMPLATE_FIELD_IDS], ["rep", "phone"]);
    assert.equal(TEMPLATE_FIELD_HEADERS.rep, "Nombre");
    assert.equal(TEMPLATE_FIELD_HEADERS.phone, "Teléfono");
  });
});
