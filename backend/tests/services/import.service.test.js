import XLSX from "xlsx";
import { parseSpreadsheet, suggestMapping, mapRows } from "../../src/services/import.service.js";

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
});
