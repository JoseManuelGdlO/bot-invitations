import XLSX from "xlsx";
import {
  parseSpreadsheet,
  suggestMapping,
  mapRows,
  columnVarKeys,
  sanitizeGuestCustomData,
} from "../../src/services/import.service.js";

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

  test("mapRows normaliza lada extranjera y descarta teléfonos inválidos", () => {
    const mapped = mapRows(
      ["Nombre", "Teléfono"],
      [
        ["Ana", "+1 817-727-2994"],
        ["Luis", "618 321 8624"],
        ["Corto", "12345"],
        ["Largo", "1234567890123456"],
      ],
      { Nombre: "rep", Teléfono: "phone" },
    );
    expect(mapped.map((row) => [row.rep, row.phone])).toEqual([
      ["Ana", "18177272994"],
      ["Luis", "6183218624"],
    ]);
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

  test("suggestMapping reconoce enlace y lo guarda aparte de la imagen", () => {
    expect(suggestMapping(["Nombre", "Teléfono", "Enlace", "QR"])).toEqual({
      Nombre: "rep",
      Teléfono: "phone",
      Enlace: "enlace",
      QR: "image",
    });
  });

  test("mapRows guarda el enlace en customData y prefiere el hipervínculo", () => {
    const mapped = mapRows(
      ["Nombre", "Teléfono", "Enlace"],
      [["Luis Pérez", "5511111111", "pase"]],
      { Nombre: "rep", Teléfono: "phone", Enlace: "enlace" },
      { hyperlinks: [["", "", "https://deskoplus.com/acceso/?rol=pase&t=abc"]] },
    );
    expect(mapped[0].customData).toEqual({
      enlace: "https://deskoplus.com/acceso/?rol=pase&t=abc",
    });

    const textOnly = mapRows(
      ["Nombre", "Teléfono", "Link"],
      [["Luis Pérez", "5511111111", "token-del-pase"]],
      { Nombre: "rep", Teléfono: "phone", Link: "enlace" },
    );
    expect(textOnly[0].customData.enlace).toBe("token-del-pase");
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

  test("sanitizeGuestCustomData guarda enlace y columnas extra", () => {
    expect(
      sanitizeGuestCustomData({
        enlace: " https://pase.example/a ",
        menu_especial: "vegano",
        mesa: "4",
        image: "https://cdn.example/a.png",
        "": "x",
        "no vale": "x",
      }),
    ).toEqual({
      enlace: "https://pase.example/a",
      menu_especial: "vegano",
    });
  });

  test("sanitizeGuestCustomData ignora valores vacíos y datos que no son objeto", () => {
    expect(sanitizeGuestCustomData(null)).toEqual({});
    expect(sanitizeGuestCustomData(["enlace"])).toEqual({});
    expect(sanitizeGuestCustomData({ enlace: "  ", alergias: "" })).toEqual({});
  });
});
