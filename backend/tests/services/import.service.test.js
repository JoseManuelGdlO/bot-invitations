import XLSX from "xlsx";
import { parseSpreadsheet, suggestMapping, mapRows, columnVarKeys } from "../../src/services/import.service.js";

function xlsxBuffer() {
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Nombre", "Teléfono", "Invitados"],
    ["Luis Pérez", "5511111111", 2],
    ["", "", ""],
    ["Sin teléfono", "", 1],
  ]);
  XLSX.utils.book_append_sheet(wb, sheet, "Invitados");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

describe("import.service", () => {
  test("parseSpreadsheet ignora filas vacías", () => {
    const parsed = parseSpreadsheet(xlsxBuffer());
    expect(parsed.columns).toEqual(["Nombre", "Teléfono", "Invitados"]);
    expect(parsed.rows).toHaveLength(2);
  });

  test("suggestMapping reconoce alias en español", () => {
    expect(suggestMapping(["Nombre", "Teléfono", "Mesa"])).toEqual({
      Nombre: "rep",
      Teléfono: "phone",
      Mesa: "table",
    });
  });

  test("suggestMapping reconoce celular, cupo y nombre completo", () => {
    expect(suggestMapping(["Nombre completo", "Celular", "Cupo"])).toEqual({
      "Nombre completo": "rep",
      Celular: "phone",
      Cupo: "invited",
    });
  });

  test("mapRows descarta filas sin nombre o teléfono", () => {
    const mapped = mapRows(
      ["Nombre", "Teléfono", "Invitados"],
      [
        ["Luis Pérez", "5511111111", "2"],
        ["Sin teléfono", "", "1"],
      ],
      { Nombre: "rep", Teléfono: "phone", Invitados: "invited" },
    );
    expect(mapped).toEqual([
      expect.objectContaining({ rep: "Luis Pérez", phone: "5511111111", invited: 2 }),
    ]);
  });

  test("suggestMapping guarda columnas extra como custom", () => {
    expect(suggestMapping(["Nombre", "Teléfono", "Menú especial"])).toEqual({
      Nombre: "rep",
      Teléfono: "phone",
      "Menú especial": "custom",
    });
  });

  test("mapRows guarda columnas custom como customData", () => {
    const columns = ["Nombre", "Teléfono", "Menú especial"];
    const mapped = mapRows(
      columns,
      [["Luis Pérez", "5511111111", "Sin gluten"]],
      { Nombre: "rep", Teléfono: "phone", "Menú especial": "custom" },
    );
    expect(columnVarKeys(columns)["Menú especial"]).toBe("menu_especial");
    expect(mapped[0].customData).toEqual({ menu_especial: "Sin gluten" });
  });

  test("mapRows ignora columnas marcadas ignore", () => {
    const mapped = mapRows(
      ["Nombre", "Teléfono", "Interno"],
      [["Luis Pérez", "5511111111", "secreto"]],
      { Nombre: "rep", Teléfono: "phone", Interno: "ignore" },
    );
    expect(mapped[0].customData).toEqual({});
  });

  test("suggestMapping reconoce imagen y qr", () => {
    expect(suggestMapping(["Nombre", "Teléfono", "Imagen", "QR"])).toEqual({
      Nombre: "rep",
      Teléfono: "phone",
      Imagen: "image",
      QR: "image",
    });
  });

  test("mapRows no guarda la imagen en customData y prefiere el hipervínculo", () => {
    const mapped = mapRows(
      ["Nombre", "Teléfono", "Imagen"],
      [["Luis Pérez", "5511111111", "QR"]],
      { Nombre: "rep", Teléfono: "phone", Imagen: "image" },
      { sheetRows: [2], hyperlinks: [["", "", "https://cdn.example/qr.png"]] },
    );
    expect(mapped[0].customData).toEqual({});
    expect(mapped[0].imageCell).toBe("https://cdn.example/qr.png");
    expect(mapped[0].sheetRow).toBe(2);
  });
});
